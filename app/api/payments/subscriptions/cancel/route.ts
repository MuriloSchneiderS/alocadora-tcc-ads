import { cancelAbacateSubscription, AbacatePayError } from "@/lib/abacate-pay";
import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || !("subscriptionId" in body) || typeof body.subscriptionId !== "string"
    || !/^subs_[A-Za-z0-9_-]+$/.test(body.subscriptionId))
    return Response.json({ error: "invalid-subscription" }, { status: 400 });

  try {
    const database = getAdminFirestore(authentication.user.projectId);
    const subscriptionRef = database.collection("assinatura").doc(body.subscriptionId);
    const snapshot = await subscriptionRef.get();
    if (!snapshot.exists || snapshot.data()?.usuario !== authentication.user.uid)
      return Response.json({ error: "subscription-not-found" }, { status: 404 });
    if (snapshot.data()?.status === "cancelada")
      return Response.json({ cancelled: true });

    await cancelAbacateSubscription(body.subscriptionId);
    await subscriptionRef.update({
      status: "cancelada",
      cancelada_em: FieldValue.serverTimestamp(),
      atualizado_em: FieldValue.serverTimestamp(),
    });
    return Response.json({ cancelled: true });
  } catch (error) {
    console.error("Subscription cancellation failed", {
      userId: authentication.user.uid,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({
      error: error instanceof Error && /firebase-admin-/.test(error.message)
        ? "firebase-admin-configuration"
        : error instanceof AbacatePayError
          ? "subscription-cancellation-failed"
          : "subscription-cancellation-failed",
    }, { status: error instanceof AbacatePayError ? 502 : 503 });
  }
}
