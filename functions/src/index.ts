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
const MODEL = "imagen-3.0-capability-001";
const API_ENDPOINT = "us-central1-aiplatform.googleapis.com";

// 1. Setup Client
const clientOptions = {
  apiEndpoint: API_ENDPOINT
};
const predictionServiceClient = new PredictionServiceClient(clientOptions);

export const generateProfessionalBackground = onObjectFinalized({
  cpu: 2,
  memory: "2GiB",
  timeoutSeconds: 300
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

    // Download the Image
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);
    const [fileBuffer] = await file.download();
    const base64Image = fileBuffer.toString("base64");

    // 2. Define Endpoint Path
    const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${MODEL}`;

    // 3. Prepare Input (Standard Image-to-Image Generation)
    const prompt = "A high-end e-commerce shot of exactly this product. Isolate the object and place it on a seamless white background. 4k, photorealistic, sharp focus.";

    // IMPORTANT: Ensure base64 string does not have the "data:image/..." prefix
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const instanceValue = {
      prompt: prompt,
      image: {
        bytesBase64Encoded: cleanBase64
      }
    };
    const instance = helpers.toValue(instanceValue);

    // 4. Prepare Parameters
    const parameterValue = {
      sampleCount: 1,
      aspectRatio: "1:1"
      // Note: For this specific model, if it fails demanding a mask, we will add mask logic later.
      // For now, we mirror the Studio behavior which accepted Image + Prompt.
    };
    const parameters = helpers.toValue(parameterValue);

    // 5. Call API
    console.log("Sending request to Imagen 3 Capability 001...");
    console.log("Endpoint:", endpoint);

    const [response] = await predictionServiceClient.predict({
      endpoint,
      instances: [instance!],
      parameters
    });

    console.log("Raw Response received.");

    // 6. Parse Output (Protobuf)
    const predictions = response.predictions;
    if (!predictions || predictions.length === 0) {
      throw new Error("No predictions returned");
    }

    // Convert Protobuf back to JS object
    // Casting to any to avoid TS issues with Protobuf Value type
    const predictionObj = helpers.fromValue(predictions[0] as any);
    const generatedBase64 = (predictionObj as any).bytesBase64Encoded;

    if (!generatedBase64) {
      console.error("Prediction Object:", JSON.stringify(predictionObj));
      throw new Error("Prediction result is missing bytesBase64Encoded");
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
