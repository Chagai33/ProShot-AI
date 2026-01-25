# ProShot AI

An advanced AI-powered product photography studio that helps users transform simple product photos into professional-grade marketing assets.

## Quick Start

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Set up Environment Variables**:
    Create a `.env.local` file with your Firebase configuration:
    ```env
    NEXT_PUBLIC_FIREBASE_API_KEY=...
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
    NEXT_PUBLIC_FIREBASE_APP_ID=...
    ```

3.  **Run Development Server**:
    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) to view the application.

## Features

-   **High Fidelity Background Removal**: Instantly remove backgrounds from product images with high precision.
-   **Creative AI (Subject-Preserving)**: Generate professional backgrounds based on text prompts while keeping the original product unchanged (using Imagen 3 BGSWAP).
-   **AI Vision Analysis**: Automatically analyzes uploaded products using Gemini to understand context and details.
-   **Multi-language Support (i18n)**: Full support for Hebrew (RTL) and English.
-   **Secure Cloud Processing**: Image processing happens securely in Google Cloud Functions using Vertex AI.

## Architecture

This project is built with:

-   **Frontend**: Next.js 14, React, Tailwind CSS, Shadcn/ui.
-   **Backend**: Firebase (Functions, Firestore, Storage, Authentication).
-   **AI Models**:
    -   *Vision*: Google Gemini 3 Flash (Analysis).
    -   *Generation*: Google Imagen 3 (Background Replacement).

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase Client SDK Config | Yes |
| `GOOGLE_APPLICATION_CREDENTIALS` | (Backend) Service Account for Vertex AI | Yes (Local Dev) |

## Development

-   **Functions**: Located in `/functions`. Run `npm run build` in that directory to compile TypeScript.
-   **Deployment**:
    ```bash
    firebase deploy --only functions
    firebase deploy --only hosting
    ```

## License

Private / Proprietary.
