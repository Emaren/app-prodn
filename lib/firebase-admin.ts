// lib/firebase-admin.ts

import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";

// Validate the required environment variables
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  throw new Error(
    "Missing one of FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY"
  );
}

// Replace escaped "\n" with actual newlines—critical to proper PEM formatting
privateKey = privateKey.replace(/\\n/g, "\n"); // conforms to widely-used workaround :contentReference[oaicite:1]{index=1}

// Construct the service account object
const serviceAccount = {
  projectId,
  clientEmail,
  privateKey,
};

// Avoid re-initializing the admin app on hot reload or multiple imports
const adminApp: App =
  getApps().length === 0
    ? initializeApp({ credential: cert(serviceAccount) })
    : getApps()[0];

// Export the auth instance
export const adminAuth: Auth = getAuth(adminApp);
