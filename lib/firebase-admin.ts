import "server-only";

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function getAdminFirestore(expectedProjectId?: string) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId)
    throw new Error("firebase-admin-project-id-missing");
  if (expectedProjectId && projectId !== expectedProjectId)
    throw new Error("firebase-admin-project-mismatch");

  if (getApps().length === 0) {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (clientEmail && privateKey) {
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId,
      });
    } else if (process.env.FIREBASE_ADMIN_USE_APPLICATION_DEFAULT === "true") {
      initializeApp({ credential: applicationDefault(), projectId });
    } else {
      throw new Error("firebase-admin-credentials-missing");
    }
  }

  return getFirestore();
}
