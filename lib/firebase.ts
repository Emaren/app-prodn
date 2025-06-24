// lib/firebase.ts
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getAnalytics, Analytics } from "firebase/analytics";

/**
 * All values MUST come from .env (.env.local in dev, dashboard in prod).
 * If any required var is missing we throw at boot instead of sending a
 * malformed 400 request to accounts:signInWithPassword.
 */
function env(name: string): string {
  const v = process.env[`NEXT_PUBLIC_${name}`];
  if (!v) throw new Error(`Missing NEXT_PUBLIC_${name} in env`);
  return v;
}

const firebaseConfig = {
  apiKey: env("FIREBASE_API_KEY"),
  authDomain: env("FIREBASE_AUTH_DOMAIN"),
  projectId: env("FIREBASE_PROJECT_ID"),
  storageBucket: env("FIREBASE_STORAGE_BUCKET"), // e.g. aoe2hd.appspot.com
  messagingSenderId: env("FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("FIREBASE_APP_ID"),
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth: Auth = getAuth(app);
export const analytics: Analytics | null =
  typeof window !== "undefined" && firebaseConfig.measurementId
    ? getAnalytics(app)
    : null;

export default app;
