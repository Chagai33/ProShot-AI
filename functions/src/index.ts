import { onObjectFinalized } from "firebase-functions/v2/storage";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
// import { VertexAI, HarmCategory, HarmBlockThreshold } from "@google-cloud/vertexai";

initializeApp();
const db = getFirestore();
const storage = getStorage();

// const project = "proshot-ai-a365e";
// const location = "us-central1"; // Or your preferred region

// const vertexAI = new VertexAI({ project: project, location: location });

export const generateProfessionalBackground = onObjectFinalized({
  cpu: 2
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

  // Safety check for path structure
  if (!uid || !fileName) return;

  try {
    console.log(`Processing image: ${filePath} for user: ${uid}`);

    // Update Firestore to 'processing'
    // We query for the doc because we don't have the doc ID in the storage trigger
    // (Alternatively, we could store docId in metadata)
    const projectsRef = db.collection("users").doc(uid).collection("projects");
    const q = projectsRef.where("storagePath", "==", filePath).limit(1);
    const snapshot = await q.get();

    if (snapshot.empty) {
      console.warn("No matching project found for file:", filePath);
      return;
    }

    const projectDoc = snapshot.docs[0];
    await projectDoc.ref.update({ status: "processing" });

    // 2. Call Vertex AI (Simplified Placeholder for V1)
    // In a real scenario, you'd download the file, convert to base64, and send to Imagen.
    // For this "V0", we will simulate a delay and just copy the image as the "result".

    // --- SIMULATION ---
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);

    // Mock processing delay
    await new Promise(resolve => setTimeout(resolve, 3000));

    // For now, allow the user to see the "original" as "processed" to verify flow.
    // In real impl: const resultImage = await callImagen(fileBuffer);
    const resultPath = `users/${uid}/results/${fileName}`;
    await file.copy(resultPath);

    // Get Signed URL or Public URL logic - here keeping it simple, assuming client uses SDK to getURL
    // Or make it public:
    const resultFile = bucket.file(resultPath);
    await resultFile.makePublic();
    const processedUrl = resultFile.publicUrl();

    // 3. Update Firestore
    await projectDoc.ref.update({
      status: "completed",
      processedUrl: processedUrl,
      updatedAt: new Date()
    });

    console.log("Processing complete.");

  } catch (error) {
    console.error("Error processing image:", error);
    const projectsRef = db.collection("users").doc(uid).collection("projects");
    // Try to find and update doc to error
    const q = projectsRef.where("storagePath", "==", filePath).limit(1);
    const snapshot = await q.get();
    if (!snapshot.empty) {
      await snapshot.docs[0].ref.update({ status: "error" });
    }
  }
});
