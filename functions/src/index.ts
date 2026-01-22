import { onObjectFinalized } from "firebase-functions/v2/storage";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { helpers, PredictionServiceClient } from "@google-cloud/aiplatform";
import { VertexAI } from "@google-cloud/vertexai";

initializeApp();
const db = getFirestore();
const storage = getStorage();

// Project configuration
const PROJECT_ID = "proshot-ai-a365e";
const LOCATION = "us-central1";
const PUBLISHER = "google";
const API_ENDPOINT = "us-central1-aiplatform.googleapis.com";

// Helper: Retry logic for fetching Firestore document to handle eventual consistency
async function getDocumentWithRetry(docRef: FirebaseFirestore.DocumentReference, retries = 5, delay = 1000): Promise<FirebaseFirestore.DocumentSnapshot> {
  for (let i = 0; i < retries; i++) {
    const doc = await docRef.get();
    if (doc.exists) {
      return doc;
    }
    console.log(`Document not found, retrying in ${delay}ms... (${i + 1}/${retries})`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error(`Document ${docRef.path} not found after ${retries} retries.`);
}

// Models

const VISION_MODEL = "gemini-2.5-flash";
const GEN_MODEL = "imagen-4.0-generate-001";

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

    // Use retry logic instead of direct get()
    const projectDoc = await getDocumentWithRetry(projectRef);

    if (!projectDoc.exists) {
      // This should be caught by getDocumentWithRetry throwing, but double check
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

    // Setup Vertex AI Client for Imagen
    const clientOptions = { apiEndpoint: API_ENDPOINT };
    const predictionServiceClient = new PredictionServiceClient(clientOptions);

    // Setup Vertex AI for Gemini (Vision Analysis)
    const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
    const gemini = vertexAI.getGenerativeModel({ model: VISION_MODEL });

    // --- STEP A: VISION ANALYSIS ---
    console.log("Step B: Analyzing product with Gemini Vision...");

    const analysisPrompt = `Analyze this product image. Return a raw JSON object (no markdown) with two fields:
      1. 'productDescription': A detailed visual description of the product's shape, colors, and materials. Ignore any background clutter or packaging imperfections.
      2. 'extractedText': The exact text written on the product (in Hebrew or English).`;

    const imagePart = {
      inlineData: {
        data: cleanBase64,
        mimeType: "image/png" // Using strict png/jpg might be safer to detect from contentType, but cleanBase64 logic assumes it.
      }
    };

    const analysisResult = await gemini.generateContent({
      contents: [{ role: "user", parts: [{ text: analysisPrompt }, imagePart] }]
    });

    const analysisResponse = analysisResult.response;
    const analysisText = analysisResponse.candidates?.[0].content.parts[0].text;

    if (!analysisText) {
      throw new Error("Gemini analysis failed to return text.");
    }

    // Clean markdown code blocks if present (Gemini sometimes wraps JSON in ```json ... ```)
    const jsonString = analysisText.replace(/```json\n|\n```/g, "").replace(/```/g, "").trim();
    let analysisData;
    try {
      analysisData = JSON.parse(jsonString);
    } catch (e) {
      console.error("Failed to parse Gemini JSON:", jsonString);
      throw new Error("Gemini returned invalid JSON.");
    }

    console.log("Analysis Complete:", JSON.stringify(analysisData));

    // --- STEP B: IMAGE GENERATION ---
    console.log("Step C: Generating professional background with Imagen...");
    const genEndpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${GEN_MODEL}`;

    // Construct Synthesis Prompt
    const prompt = `Professional studio photography of ${analysisData.productDescription}. The text '${analysisData.extractedText}' is clearly visible on the product. Clean white background, soft studio lighting, 4k, photorealistic.`;

    console.log("Generated Prompt:", prompt);

    const genInstance = helpers.toValue({
      prompt: prompt
    });

    const genParams = helpers.toValue({
      sampleCount: 1,
      aspectRatio: "1:1"
    });

    console.log(`Sending generation request to ${GEN_MODEL}...`);
    const [genResponse] = await predictionServiceClient.predict({
      endpoint: genEndpoint,
      instances: [genInstance!],
      parameters: genParams
    });

    // --- Process Final Result ---
    const predictions = genResponse.predictions;
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
    const resultPath = `users/${uid}/results/${projectId}.png`;
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
