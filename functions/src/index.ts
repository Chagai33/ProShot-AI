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
const MODEL = "imagegeneration@005";
const API_ENDPOINT = "us-central1-aiplatform.googleapis.com";

// Initialize the PredictionServiceClient
const predictionServiceClient = new PredictionServiceClient({
  apiEndpoint: API_ENDPOINT,
});

export const generateProfessionalBackground = onObjectFinalized({
  cpu: 2,
  memory: "2GiB",
  timeoutSeconds: 300
}, async (event) => {
  const filePath = event.data.name; // users/{uid}/uploads/{fileName}
  const bucketName = event.data.bucket;
  const contentType = event.data.contentType;

  // 1. Validation: Only process images in 'uploads' folder
  if (!filePath.includes("/uploads/") || !contentType?.startsWith("image/")) {
    return;
  }

  const fileName = filePath.split('/').pop();
  const uid = filePath.split('/')[1];

  if (!uid || !fileName) return;

  try {
    console.log(`Processing image: ${filePath} for user: ${uid}`);

    const projectsRef = db.collection("users").doc(uid).collection("projects");
    const q = projectsRef.where("storagePath", "==", filePath).limit(1);
    const snapshot = await q.get();

    if (snapshot.empty) {
      console.warn("No matching project found for file:", filePath);
      return;
    }

    const projectDoc = snapshot.docs[0];
    await projectDoc.ref.update({ status: "processing" });

    // 2. Download the Image
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);
    const [fileBuffer] = await file.download();
    const base64Image = fileBuffer.toString("base64");

    // 3. Construct the Vertex AI Prediction Request
    const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${MODEL}`;

    const prompt = "Change the background to a clean white studio backdrop, soft lighting, professional product photography.";

    // Construct the payload exact to the user's specification for Edit Mode
    // We split into 'instances' and 'parameters' for the API call
    const instance = {
      prompt: prompt,
      image: {
        bytesBase64Encoded: base64Image
      }
    };

    // "product-image" edit mode is suitable for background replacement
    const predictionParameters = {
      sampleCount: 1,
      editConfig: {
        editMode: 'product-image',
      }
    };

    console.log("Sending prediction request to Vertex AI endpoint:", endpoint);

    // TypeScript might warn about toValue if strict, but usage is generally standard for aiplatform helper
    const [response] = await predictionServiceClient.predict({
      endpoint,
      instances: [helpers.toValue(instance)!],
      parameters: helpers.toValue(predictionParameters),
    });

    if (!response.predictions || response.predictions.length === 0) {
      throw new Error("No predictions returned from Vertex AI.");
    }

    // 4. Extract generated image
    const prediction = response.predictions[0];
    const predictionObj = helpers.fromValue(prediction as any);
    const generatedBase64 = (predictionObj as any)?.bytesBase64Encoded;

    if (!generatedBase64) {
      console.error("Prediction Result:", JSON.stringify(predictionObj));
      throw new Error("No image data found in prediction response.");
    }

    // 5. Save the Result
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

    // 6. Update Firestore
    await projectDoc.ref.update({
      status: "completed",
      processedUrl: processedUrl,
      updatedAt: new Date()
    });

    console.log("Processing complete. Image saved to:", resultPath);

  } catch (error) {
    console.error("Error processing image:", error);
    if (error instanceof Error) {
      console.error("Error Details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    }

    const projectsRef = db.collection("users").doc(uid).collection("projects");
    const q = projectsRef.where("storagePath", "==", filePath).limit(1);
    const snapshot = await q.get();
    if (!snapshot.empty) {
      // @ts-ignore
      await snapshot.docs[0].ref.update({ status: "error", error: error.message || "Unknown error" });
    }
  }
});
