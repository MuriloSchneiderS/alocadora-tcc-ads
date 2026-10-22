import "server-only";

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

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
    } else if (process.env.FIREBASE_ADMIN_USE_APPLICATION_DEFAULT === "true"
      || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      initializeApp({ credential: applicationDefault(), projectId });
    } else {
      throw new Error("firebase-admin-credentials-missing");
    }
  }

  return getFirestore();
}

export function getAdminStorageBucket(expectedProjectId?: string) {
  getAdminFirestore(expectedProjectId);
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName)
    throw new Error("firebase-admin-storage-bucket-missing");
  return getStorage().bucket(bucketName);
}
