import "server-only";

import { getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getAdminFirestore } from "@/lib/firebase-admin";

export function getAdminAuth() {
  if (getApps().length === 0)
    getAdminFirestore();
  return getAuth();
}