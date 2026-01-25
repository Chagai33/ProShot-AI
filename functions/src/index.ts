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

const VISION_MODEL = "gemini-3-flash";

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
  const userPrompt = metadata.userPrompt; // Check for user prompt

  if (!projectId) {
    console.error(`ERROR: No 'projectId' found in customMetadata for file: ${filePath}`);
    return;
  }

  console.log(`Processing Project: ${projectId} (File: ${filePath}, User: ${uid})`);
  if (userPrompt) {
    console.log(`Mode: Creative AI (Prompt: "${userPrompt}")`);
  } else {
    console.log("Mode: High Fidelity (Background Removal)");
  }

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

    let resultBuffer: Buffer;

    if (userPrompt) {
      // --- MODE B: CREATIVE AI (Gemini + Imagen) ---

      const base64Image = fileBuffer.toString("base64");
      const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

      // Setup Vertex AI Client for Imagen
      const clientOptions = { apiEndpoint: API_ENDPOINT };
      const predictionServiceClient = new PredictionServiceClient(clientOptions);

      // Setup Vertex AI for Gemini (Vision Analysis)
      const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
      const gemini = vertexAI.getGenerativeModel({ model: VISION_MODEL });

      // --- STEP A: VISION ANALYSIS ---
      console.log("Step A: Analyzing product with Gemini Vision...");

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

      // --- STEP B: IMAGE GENERATION (Subject-Preserving) ---
      console.log("Step B: Generating professional background with Imagen (Subject-Preserving)...");

      // Use the Editing/Capability model for BGSWAP
      const EDIT_MODEL = "imagen-3.0-capability-001";
      const genEndpoint = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${EDIT_MODEL}`;

      // Construct synthesis prompt
      const prompt = `Professional studio photography of the product. Context: ${userPrompt}. High resolution, 4k, cinematic lighting, professional composition.`;

      console.log("Target Prompt:", prompt);

      const genInstance = helpers.toValue({
        prompt: prompt,
        image: {
          bytesBase64Encoded: cleanBase64
        }
      });

      const genParams = helpers.toValue({
        editConfig: {
          editMode: "EDIT_MODE_BGSWAP",
          maskConfig: {
            maskMode: "MASK_MODE_BACKGROUND"
          }
        },
        sampleCount: 1,
        aspectRatio: "1:1",
        addWatermark: false // Pragmatic: remove watermark if possible, or set to true if required
      });

      console.log(`Sending BGSWAP request to ${EDIT_MODEL}...`);
      const [genResponse] = await predictionServiceClient.predict({
        endpoint: genEndpoint,
        instances: [genInstance!],
        parameters: genParams
      });

      // --- Process Final Result ---
      const predictions = genResponse.predictions;
      if (!predictions || predictions.length === 0) {
        throw new Error("No generation predictions returned from Imagen.");
      }

      // Convert Protobuf back to JS object
      const predictionObj = helpers.fromValue(predictions[0] as any);
      const generatedBase64 = (predictionObj as any).bytesBase64Encoded;

      if (!generatedBase64) {
        console.error("Generation Object:", JSON.stringify(predictionObj));
        throw new Error("Generation result is missing bytesBase64Encoded.");
      }

      resultBuffer = Buffer.from(generatedBase64, 'base64');

    } else {
      // --- MODE A: HIGH FIDELITY (Background Removal) ---
      console.log("Starting Background Removal...");

      // Dynamic lazy import to avoid deployment/initialization issues
      const { removeBackground } = await import("@imgly/background-removal-node");
      const sharp = (await import("sharp")).default;

      // Sanitize image using Sharp to ensure clean format for @imgly
      console.log(`Original image size: ${fileBuffer.length} bytes`);
      const sanitizedBuffer = await sharp(fileBuffer)
        .toFormat('png')
        .ensureAlpha()
        .toBuffer();

      console.log(`Sanitized PNG size: ${sanitizedBuffer.length} bytes`);

      // Remove background
      // @imgly/background-removal-node returns a Blob
      const blob = await removeBackground(sanitizedBuffer);
      const arrayBuffer = await blob.arrayBuffer();
      const transparentBuffer = Buffer.from(arrayBuffer);

      // Composite onto white background using Sharp
      console.log("Compositing onto white background...");
      const image = sharp(transparentBuffer);

      resultBuffer = await image
        .flatten({ background: { r: 255, g: 255, b: 255 } }) // Flatten alpha channel onto white
        .toFormat('png')
        .toBuffer();
    }

    // Save the Result
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
