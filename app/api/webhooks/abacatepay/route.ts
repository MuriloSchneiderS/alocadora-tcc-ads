import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { addCalendarMonth, updatePublicationEntitlement } from "@/lib/payment-access";

export const runtime = "nodejs";

const abacatePayPublicKey = "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

type EventPayload = {
  id: string;
  event: string;
  createdAt?: string;
  data: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEventPayload(value: unknown): value is EventPayload {
  return isRecord(value)
    && typeof value.id === "string"
    && value.id.length > 0
    && typeof value.event === "string"
    && isRecord(value.data);
}

function stringField(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function eventDate(event: EventPayload) {
  const value = stringField(event.data.paidAt, event.data.createdAt, event.createdAt);
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function verifySignature(rawBody: string, signature: string) {
  const expected = createHmac("sha256", abacatePayPublicKey)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("base64");
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(signature);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

async function findTransaction(database: FirebaseFirestore.Firestore, externalId: string | undefined, checkoutId: string | undefined) {
  if (externalId) {
    const direct = await database.collection("transacao").doc(externalId).get();
    if (direct.exists) return direct;
    const byExternalId = await database.collection("transacao")
      .where("external_id", "==", externalId).limit(1).get();
    if (!byExternalId.empty) return byExternalId.docs[0];
  }
  if (checkoutId) {
    const byCheckoutId = await database.collection("transacao")
      .where("checkout_id", "==", checkoutId).limit(1).get();
    if (!byCheckoutId.empty) return byCheckoutId.docs[0];
  }
  return null;
}

async function grantTransaction(database: FirebaseFirestore.Firestore, transactionId: string, transactionData: FirebaseFirestore.DocumentData, grantId: string, expiresAt: Date | null, paidAt: Date, subscriptionId?: string) {
  const publicationIds = Array.isArray(transactionData.publicacoes)
    ? transactionData.publicacoes.filter((id): id is string => typeof id === "string")
    : [];
  for (let index = 0; index < publicationIds.length; index += 50) {
    await Promise.all(publicationIds.slice(index, index + 50).map((publicationId) =>
      updatePublicationEntitlement(database, transactionData.comprador, publicationId, grantId, {
        active: true,
        expiresAt,
        type: transactionData.tipo,
        originType: transactionData.origem_tipo,
        originId: transactionData.origem_id,
        transactionId,
        subscriptionId,
      })));
  }
  await database.collection("transacao").doc(transactionId).update({
    status: "pago",
    comprado_em: Timestamp.fromDate(paidAt),
    expira_em: expiresAt ? Timestamp.fromDate(expiresAt) : null,
    atualizado_em: FieldValue.serverTimestamp(),
  });
}

async function revokeTransaction(database: FirebaseFirestore.Firestore, transactionId: string, transactionData: FirebaseFirestore.DocumentData, status: string) {
  const publicationIds = Array.isArray(transactionData.publicacoes)
    ? transactionData.publicacoes.filter((id): id is string => typeof id === "string")
    : [];
  if (transactionData.tipo === "assinatura") {
    const subscriptionQuery = typeof transactionData.assinatura_id === "string"
      ? await database.collection("assinatura").doc(transactionData.assinatura_id).get()
      : null;
    const subscriptionSnapshots = subscriptionQuery?.exists
      ? [subscriptionQuery]
      : (await database.collection("assinatura").where("transacao", "==", transactionId).get()).docs;
    for (const subscription of subscriptionSnapshots) {
      const subscriptionData = subscription.data()!;
      const coveredPublications = Array.isArray(subscriptionData.publicacoes)
        ? subscriptionData.publicacoes.filter((id): id is string => typeof id === "string")
        : publicationIds;
      for (const publicationId of coveredPublications) {
        const grants = await database.collection("acesso").doc(transactionData.comprador)
          .collection("publicacoes").doc(publicationId).collection("fontes")
          .where("assinatura_id", "==", subscription.id).get();
        await Promise.all(grants.docs.map((grantSnapshot) => {
          const grant = grantSnapshot.data();
          return updatePublicationEntitlement(database, transactionData.comprador, publicationId, grantSnapshot.id, {
            active: false,
            expiresAt: null,
            type: String(grant.tipo ?? "assinatura"),
            originType: String(grant.origem_tipo ?? "catalogo"),
            originId: String(grant.origem_id ?? subscriptionData.catalogo ?? ""),
            transactionId: String(grant.transacao ?? transactionId),
            subscriptionId: subscription.id,
          });
        }));
      }
      await subscription.ref.update({
        status: "cancelada",
        atualizado_em: FieldValue.serverTimestamp(),
      });
    }
  } else {
    await Promise.all(publicationIds.map((publicationId) =>
      updatePublicationEntitlement(database, transactionData.comprador, publicationId, `tx_${transactionId}`, {
        active: false,
        expiresAt: null,
        type: transactionData.tipo,
        originType: transactionData.origem_tipo,
        originId: transactionData.origem_id,
        transactionId,
      })));
  }
  await database.collection("transacao").doc(transactionId).update({
    status,
    atualizado_em: FieldValue.serverTimestamp(),
  });
}

async function processEvent(database: FirebaseFirestore.Firestore, event: EventPayload) {
  const nested = isRecord(event.data.subscription) ? event.data.subscription : {};
  const checkout = isRecord(event.data.checkout) ? event.data.checkout : {};
  const metadata = isRecord(event.data.metadata) ? event.data.metadata : {};
  const externalId = stringField(event.data.externalId, metadata.transactionId, nested.externalId, checkout.externalId);
  const checkoutId = stringField(event.data.checkoutId, nested.checkoutId, checkout.id,
    event.event.startsWith("subscription.") ? undefined : event.data.id);
  const subscriptionId = stringField(nested.id, event.data.subscriptionId,
    event.event.startsWith("subscription.") ? event.data.id : undefined);
  const paidAt = eventDate(event);

  if (event.event === "checkout.completed") {
    const transaction = await findTransaction(database, externalId, checkoutId);
    if (!transaction) throw new Error("payment-transaction-not-found");
    const data = transaction.data()!;
    if (data.tipo === "assinatura") {
      await transaction.ref.update({
        status: "aguardando_assinatura",
        checkout_id: checkoutId ?? data.checkout_id ?? null,
        atualizado_em: FieldValue.serverTimestamp(),
      });
      return;
    }
    const expiresAt = data.tipo === "aluguel"
      ? new Date(paidAt.getTime() + Number(data.duracao ?? 7) * 24 * 60 * 60 * 1000)
      : null;
    await grantTransaction(database, transaction.id, data, `tx_${transaction.id}`, expiresAt, paidAt);
    return;
  }

  if (event.event === "subscription.completed") {
    const transaction = await findTransaction(database, externalId, checkoutId);
    if (!transaction || !subscriptionId) throw new Error("payment-subscription-not-found");
    const data = transaction.data()!;
    const expiresAt = addCalendarMonth(paidAt);
    const subscriptionRef = database.collection("assinatura").doc(subscriptionId);
    await subscriptionRef.set({
      usuario: data.comprador,
      vendedor: data.vendedor,
      catalogo: data.origem_id,
      tipo: "assinatura",
      status: "ativa",
      ciclo: "MONTHLY",
      preco: data.preco,
      moeda: "BRL",
      checkout_id: checkoutId ?? data.checkout_id ?? null,
      transacao: transaction.id,
      publicacoes: data.publicacoes,
      expira_em: Timestamp.fromDate(expiresAt),
      criado_em: Timestamp.fromDate(paidAt),
      atualizado_em: FieldValue.serverTimestamp(),
    }, { merge: true });
    await grantTransaction(database, transaction.id, data, `sub_${subscriptionId}_start`, expiresAt, paidAt, subscriptionId);
    return;
  }

  if (event.event === "subscription.renewed") {
    if (!subscriptionId) throw new Error("payment-subscription-id-missing");
    const subscriptionRef = database.collection("assinatura").doc(subscriptionId);
    const subscriptionSnapshot = await subscriptionRef.get();
    if (!subscriptionSnapshot.exists) throw new Error("payment-subscription-not-found");
    const subscription = subscriptionSnapshot.data()!;
    const previousExpiry = subscription.expira_em instanceof Timestamp ? subscription.expira_em.toDate() : null;
    const anchor = previousExpiry && previousExpiry > paidAt ? previousExpiry : paidAt;
    const expiresAt = addCalendarMonth(anchor);
    const renewalId = createHash("sha256").update(event.id).digest("hex");
    const renewalRef = database.collection("transacao").doc(`renovacao_${renewalId}`);
    const renewalTransaction = {
      comprador: subscription.usuario,
      vendedor: subscription.vendedor,
      origem_tipo: "catalogo",
      origem_id: subscription.catalogo,
      publicacoes: subscription.publicacoes,
      tipo: "assinatura",
      preco: subscription.preco,
      moeda: "BRL",
      status: "pago",
      assinatura_id: subscriptionId,
      event_id: event.id,
      comprado_em: Timestamp.fromDate(paidAt),
      expira_em: Timestamp.fromDate(expiresAt),
      criado_em: FieldValue.serverTimestamp(),
    };
    await renewalRef.set(renewalTransaction, { merge: true });
    await Promise.all((subscription.publicacoes as string[]).map((publicationId) =>
      updatePublicationEntitlement(database, subscription.usuario, publicationId, `sub_${subscriptionId}_${renewalId.slice(0, 20)}`, {
        active: true,
        expiresAt,
        type: "assinatura",
        originType: "catalogo",
        originId: subscription.catalogo,
        transactionId: renewalRef.id,
        subscriptionId,
      })));
    await subscriptionRef.update({
      status: "ativa",
      expira_em: Timestamp.fromDate(expiresAt),
      atualizado_em: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (event.event === "subscription.payment_failed" || event.event === "subscription.cancelled") {
    if (!subscriptionId) throw new Error("payment-subscription-id-missing");
    const subscriptionRef = database.collection("assinatura").doc(subscriptionId);
    const subscriptionSnapshot = await subscriptionRef.get();
    if (!subscriptionSnapshot.exists) {
      if (event.event === "subscription.payment_failed") return;
      throw new Error("payment-subscription-not-found");
    }
    await subscriptionRef.update({
      status: event.event === "subscription.cancelled" ? "cancelada" : "inadimplente",
      cancelada_em: event.event === "subscription.cancelled" ? FieldValue.serverTimestamp() : null,
      atualizado_em: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (["checkout.refunded", "checkout.disputed", "checkout.lost"].includes(event.event)) {
    const transaction = await findTransaction(database, externalId, checkoutId);
    if (!transaction) throw new Error("payment-transaction-not-found");
    const status = event.event === "checkout.refunded" ? "reembolsado" : event.event === "checkout.disputed" ? "contestado" : "contestacao_perdida";
    await revokeTransaction(database, transaction.id, transaction.data()!, status);
  }
}

async function claimEvent(database: FirebaseFirestore.Firestore, event: EventPayload) {
  const eventDocId = createHash("sha256").update(event.id).digest("hex");
  const eventRef = database.collection("eventos_pagamento").doc(eventDocId);
  const claimId = randomUUID();
  const acquired = await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(eventRef);
    const data = snapshot.data();
    if (data?.status === "concluido")
      return false;
    if (data?.status === "processando" && Number(data.lock_ate ?? 0) > Date.now())
      throw new Error("payment-event-in-progress");
    transaction.set(eventRef, {
      provider: "abacatepay",
      event_id: event.id,
      event_type: event.event,
      status: "processando",
      claim_id: claimId,
      lock_ate: Date.now() + 60_000,
      atualizado_em: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  return { eventRef, claimId, acquired };
}

export async function POST(request: Request) {
  const expectedSecret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  if (!expectedSecret)
    return Response.json({ error: "webhook-configuration" }, { status: 503 });
  const suppliedSecret = new URL(request.url).searchParams.get("webhookSecret") ?? "";
  const expectedBytes = Buffer.from(expectedSecret);
  const suppliedBytes = Buffer.from(suppliedSecret);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes))
    return Response.json({ error: "unauthorized" }, { status: 401 });

  const rawBody = await request.text();
  if (rawBody.length > 1_000_000)
    return Response.json({ error: "payload-too-large" }, { status: 413 });
  const signature = request.headers.get("X-Webhook-Signature") ?? "";
  if (!signature || !verifySignature(rawBody, signature))
    return Response.json({ error: "invalid-signature" }, { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid-payload" }, { status: 400 });
  }
  if (!isEventPayload(payload))
    return Response.json({ error: "invalid-payload" }, { status: 400 });

  let eventClaim: Awaited<ReturnType<typeof claimEvent>> | null = null;
  try {
    const database = getAdminFirestore();
    eventClaim = await claimEvent(database, payload);
    if (!eventClaim.acquired)
      return Response.json({ received: true, duplicate: true });

    await processEvent(database, payload);
    await eventClaim.eventRef.update({
      status: "concluido",
      processado_em: FieldValue.serverTimestamp(),
      claim_id: null,
      lock_ate: null,
    });
    return Response.json({ received: true });
  } catch (error) {
    console.error("Abacate Pay webhook processing failed", {
      eventId: payload.id,
      eventType: payload.event,
      error: error instanceof Error ? error.message : "unknown",
    });
    if (eventClaim?.acquired) {
      await eventClaim.eventRef.update({
        status: "erro",
        claim_id: null,
        lock_ate: null,
        atualizado_em: FieldValue.serverTimestamp(),
      }).catch((updateError) => {
        console.error("Failed to release payment event claim", updateError);
      });
    }
    return Response.json({ error: "webhook-processing-failed" }, { status: 500 });
  }
}
