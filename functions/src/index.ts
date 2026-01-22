import { onObjectFinalized } from "firebase-functions/v2/storage";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { helpers, PredictionServiceClient } from "@google-cloud/aiplatform";

initializeApp();
const db = getFirestore();
const storage = getStorage();

// Project configuration
const PROJECT_ID = "proshot-ai-a365e";
const LOCATION = "us-central1";
const PUBLISHER = "google";
const API_ENDPOINT = "us-central1-aiplatform.googleapis.com";

// Models
const SEG_MODEL = "image-segmentation-001";
const GEN_MODEL = "imagen-3.0-capability-001";

export const generateProfessionalBackground = onObjectFinalized({
  cpu: 2,
  memory: "2GiB",
  timeoutSeconds: 300, // Process can be long
  region: "us-central1"
}, async (event) => {
  const filePath = event.data.name; // users/{uid}/uploads/{fileName}
  const bucketName = event.data.bucket;
  const contentType = event.data.contentType;

  // Validation: Only process images in 'uploads' folder
  if (!filePath.includes("/uploads/") || !contentType?.startsWith("image/")) {
    return;
  }

  const fileName = filePath.split('/').pop();
  const uid = filePath.split('/')[1];

  if (!uid || !fileName) return;

  // --- Extract Project ID from Custom Metadata ---
  const metadata = event.data.metadata || {};
  const projectId = metadata.projectId;

  if (!projectId) {
    console.error(`ERROR: No 'projectId' found in customMetadata for file: ${filePath}`);
    return;
  }

  console.log(`Processing Project: ${projectId} (File: ${filePath}, User: ${uid})`);

  try {
    // Direct document reference using projectId from metadata
    const projectRef = db.collection("users").doc(uid).collection("projects").doc(projectId);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      console.error(`ERROR: Project document not found in Firestore for ID: ${projectId}`);
      return;
    }

    await projectRef.update({ status: "processing" });

    // Download the Image
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);
    const [fileBuffer] = await file.download();
    const base64Image = fileBuffer.toString("base64");
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    // Setup Vertex AI Client
    const clientOptions = { apiEndpoint: API_ENDPOINT };
    const predictionServiceClient = new PredictionServiceClient(clientOptions);

    // --- STEP 1: GENERATE MASK (Segmentation) ---
    console.log("Step 1: Generating segmentation mask for product isolation...");
    const segEndpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${SEG_MODEL}`;

    const segInstance = helpers.toValue({
      image: { bytesBase64Encoded: cleanBase64 }
    });
    // "salient_object" is typically used for main subject segmentation
    const segParams = helpers.toValue({ segmentation_type: "salient_object" });

    const [segResponse] = await predictionServiceClient.predict({
      endpoint: segEndpoint,
      instances: [segInstance!],
      parameters: segParams
    });

    if (!segResponse.predictions || segResponse.predictions.length === 0) {
      throw new Error("No segmentation mask returned.");
    }

    // Extract mask
    const segPredictionObj = helpers.fromValue(segResponse.predictions[0] as any);
    const maskBase64 = (segPredictionObj as any).bytesBase64Encoded;

    if (!maskBase64) {
      console.error("Segmentation response:", JSON.stringify(segPredictionObj));
      throw new Error("Segmentation result missing bytesBase64Encoded.");
    }
    console.log("Mask generated successfully.");

    // --- STEP 2: EDIT WITH MASK (Inpainting) ---
    console.log("Step 2: Performing background replacement using mask...");
    const editEndpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${GEN_MODEL}`;

    // Validated prompt
    const prompt = "A high-end e-commerce shot of exactly this product. Isolate the object and place it on a seamless white background. 4k, photorealistic, sharp focus.";

    const editInstance = helpers.toValue({
      prompt: prompt,
      image: { bytesBase64Encoded: cleanBase64 },
      mask: {
        image: { bytesBase64Encoded: maskBase64 }
      }
    });

    const editParams = helpers.toValue({
      sampleCount: 1,
      aspectRatio: "1:1",
      mode: "inpainting"
    });

    console.log("Sending inpainting request to Imagen 3 Capability...");
    const [editResponse] = await predictionServiceClient.predict({
      endpoint: editEndpoint,
      instances: [editInstance!],
      parameters: editParams
    });

    // --- Process Final Result ---
    const predictions = editResponse.predictions;
    if (!predictions || predictions.length === 0) {
      throw new Error("No generation predictions returned.");
    }

    // Convert Protobuf back to JS object
    const predictionObj = helpers.fromValue(predictions[0] as any);
    const generatedBase64 = (predictionObj as any).bytesBase64Encoded;

    if (!generatedBase64) {
      console.error("Generation Object:", JSON.stringify(predictionObj));
      throw new Error("Generation result is missing bytesBase64Encoded.");
    }

    // Save the Result
    const resultBuffer = Buffer.from(generatedBase64, 'base64');
    const resultPath = `users/${uid}/results/${fileName}`;
    const resultFile = bucket.file(resultPath);

    await resultFile.save(resultBuffer, {
      metadata: {
        contentType: 'image/png',
      }
    });

    await resultFile.makePublic();
    const processedUrl = resultFile.publicUrl();

    // Update Firestore
    await projectRef.update({
      status: "completed",
      processedUrl: processedUrl,
      updatedAt: new Date()
    });

    console.log("Processing pipeline complete. Image saved to:", resultPath);

  } catch (error) {
    console.error("Error processing image pipeline:", error);
    if (error instanceof Error) {
      console.error("Error Details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    }

    // Update project status to error using metadata projectId
    const metadata = event.data.metadata || {};
    const projectId = metadata.projectId;

    if (projectId && uid) {
      const projectRef = db.collection("users").doc(uid).collection("projects").doc(projectId);
      await projectRef.update({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
});
