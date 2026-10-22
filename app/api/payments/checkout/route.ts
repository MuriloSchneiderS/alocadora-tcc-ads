import { randomUUID } from "node:crypto";
import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";
import { createAbacateCheckout, createAbacateCustomer, AbacatePayError } from "@/lib/abacate-pay";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { ensureAbacateProduct } from "@/lib/payment-products";
import { getCatalogAcquisitionState, getPublicationAcquisitionState } from "@/lib/payment-access";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

type CheckoutRequest = {
  originType: "publicacao" | "catalogo";
  originId: string;
  tipo: "aluguel" | "compra" | "assinatura";
};

//checa se o valor é um UUID válido
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
//checa se o valor é uma requisição de checkout válida
function isCheckoutRequest(value: unknown): value is CheckoutRequest {
  return isRecord(value)
    && (value.originType === "publicacao" || value.originType === "catalogo")
    && typeof value.originId === "string"
    && /^[0-9a-f-]{36}$/i.test(value.originId)
    && (value.tipo === "aluguel" || value.tipo === "compra" || value.tipo === "assinatura")
    && (value.tipo !== "assinatura" || value.originType === "catalogo");
}
//checa se o valor é uma URL HTTPS válida
function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function ensureAbacateCustomer(
  database: FirebaseFirestore.Firestore,
  user: { uid: string; email: string | null; displayName: string | null },
) {
  if (!user.email)
    throw new Error("payment-customer-email-missing");

  const customerRef = database.collection("abacatepay_cliente").doc(user.uid);
  const existingCustomer = await customerRef.get();
  const existingCustomerId = existingCustomer.get("customer_id");
  if (typeof existingCustomerId === "string" && existingCustomerId)
    return existingCustomerId;

  const profileSnapshot = await database.collection("usuario").doc(user.uid).get();
  const profileName = profileSnapshot.get("nome");
  const name = typeof profileName === "string" && profileName.trim()
    ? profileName.trim()
    : user.displayName?.trim() || user.email.split("@")[0];
  const customer = await createAbacateCustomer({
    email: user.email,
    name,
    metadata: { firebaseUid: user.uid },
  });
  if (!customer.id)
    throw new Error("payment-customer-provisioning");

  await customerRef.set({
    customer_id: customer.id,
    email: user.email,
    nome: name,
    atualizado_em: FieldValue.serverTimestamp(),
  }, { merge: true });
  return customer.id;
}

export async function POST(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });

  const body: unknown = await request.json().catch(() => null);
  if (!isCheckoutRequest(body))
    return Response.json({ error: "invalid-checkout" }, { status: 400 });

  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
  if (!appUrl || !/^https:\/\//i.test(appUrl))
    return Response.json({ error: "app-url-configuration" }, { status: 503 });

  try {
    const database = getAdminFirestore(authentication.user.projectId);
    //verifica se a publicação ou catálogo existe e se a monetização do tipo solicitado está ativa
    const itemRef = database.collection(body.originType).doc(body.originId);
    const [itemSnapshot, monetizationSnapshot] = await Promise.all([
      itemRef.get(),
      itemRef.collection("monetizacao").doc(body.tipo).get(),//monetização do tipo solicitado (aluguel, compra ou assinatura) para a publicação ou catálogo
    ]);
    if (!itemSnapshot.exists || !monetizationSnapshot.exists)
      return Response.json({ error: "monetization-not-found" }, { status: 404 });

    const item = itemSnapshot.data() ?? {};//dados da publicação ou catálogo
    const monetization = monetizationSnapshot.data() ?? {};//dados da monetização do tipo solicitado
    
    //testes de validação da monetização e do usuário
    if (typeof item.criador !== "string" || !item.criador)
      return Response.json({ error: "invalid-monetization-owner" }, { status: 409 });
    if (item.criador === authentication.user.uid)
      return Response.json({ error: "cannot-purchase-own-content" }, { status: 403 });
    if (monetization.ativo !== true || monetization.tipo !== body.tipo
      || monetization.moeda !== "BRL" || !Number.isSafeInteger(monetization.preco)
      || Number(monetization.preco) <= 0)
      return Response.json({ error: "monetization-unavailable" }, { status: 409 });
    const duration = Number(monetization.duracao ?? (body.tipo === "aluguel" ? 7 : 30));
    if (body.tipo !== "compra" && (!Number.isSafeInteger(duration) || duration < 1))
      return Response.json({ error: "monetization-unavailable" }, { status: 409 });
    if (body.tipo === "assinatura" && duration !== 30)
      return Response.json({ error: "subscription-cycle-unavailable" }, { status: 409 });
    const publicationIds = body.originType === "publicacao"
      ? [body.originId]
      : Array.isArray(item.publicacoes)
        ? item.publicacoes.filter((id: unknown): id is string => typeof id === "string")
        : [];
    if (publicationIds.length === 0)
      return Response.json({ error: "empty-catalog" }, { status: 409 });

    const acquisitionState = body.originType === "publicacao"
      ? await getPublicationAcquisitionState(database, authentication.user.uid, body.originId)
      : await getCatalogAcquisitionState(database, authentication.user.uid, body.originId, publicationIds);
    if (acquisitionState === "purchased"
      || (body.tipo === "aluguel" && (acquisitionState === "rented" || acquisitionState === "subscribed"))
      || (body.tipo === "assinatura" && acquisitionState === "subscribed"))
      return Response.json({ error: "already-acquired", state: acquisitionState }, { status: 409 });

    const title = String(item.titulo ?? "Conteúdo").trim() || "Conteúdo";
    const description = String(item.descricao ?? "").trim();
    const returnPath = body.originType === "publicacao"
      ? `/exibicao?publicationId=${encodeURIComponent(body.originId)}`
      : `/catalogo/${encodeURIComponent(body.originId)}`;
    const transactionId = randomUUID();
    const transactionRef = database.collection("transacao").doc(transactionId);
    let stage = "product";

    try {
      stage = "customer";
      const creator = await getAdminAuth().getUser(item.criador);
      const [buyerCustomerId, creatorCustomerId] = await Promise.all([
        ensureAbacateCustomer(database, authentication.user),
        ensureAbacateCustomer(database, {
          uid: creator.uid,
          email: creator.email ?? null,
          displayName: creator.displayName ?? null,
        }),
      ]);

      stage = "product";
      const productId = await ensureAbacateProduct(database, {
        originType: body.originType,
        originId: body.originId,
        monetizationType: body.tipo,
        title,
        description,
        price: Number(monetization.preco),
      });
      stage = "checkout";
      const checkout = await createAbacateCheckout({
        productId,
        customerId: buyerCustomerId,
        externalId: transactionId,
        returnUrl: `${appUrl}${returnPath}${returnPath.includes("?") ? "&" : "?"}pagamento=pendente`,
        completionUrl: `${appUrl}${returnPath}${returnPath.includes("?") ? "&" : "?"}pagamento=confirmacao`,
        metadata: {
          transactionId,
          buyerId: authentication.user.uid,
          originType: body.originType,
          originId: body.originId,
        },
        subscription: body.tipo === "assinatura",
      });
      if (!checkout.id || !isHttpsUrl(checkout.url))
        throw new Error("invalid-checkout-response");

      stage = "transaction";
      await transactionRef.create({
        comprador: authentication.user.uid,
        vendedor: item.criador,
        cliente_comprador_id: buyerCustomerId,
        cliente_vendedor_id: creatorCustomerId,
        origem_tipo: body.originType,
        origem_id: body.originId,
        publicacoes: publicationIds,
        tipo: body.tipo,
        preco: Number(monetization.preco),
        duracao: body.tipo === "compra" ? null : duration,
        moeda: "BRL",
        status: "pendente",
        external_id: transactionId,
        checkout_id: checkout.id,
        checkout_url: checkout.url,
        criado_em: new Date(),
      });
      return Response.json({ checkoutUrl: checkout.url }, { status: 201 });
    } catch (error) {
      console.error("Payment checkout creation failed", {
        transactionId,
        stage,
        providerStatus: error instanceof AbacatePayError ? error.status : undefined,
        providerMessage: error instanceof AbacatePayError ? error.providerMessage : undefined,
        error: error instanceof Error ? error.message : "unknown",
      });
      return Response.json({
        error: error instanceof Error && error.message === "payment-customer-email-missing"
          ? "payment-customer-email-missing"
          : error instanceof Error && error.message === "payment-customer-provisioning"
            ? "payment-customer-provisioning"
            : error instanceof Error && error.message === "payment-product-provisioning"
          ? "payment-product-provisioning"
          : error instanceof Error && error.message === "abacatepay-api-key-missing"
            ? "abacatepay-configuration"
            : error instanceof AbacatePayError && error.status === 503
              ? "abacatepay-unavailable"
              : "checkout-creation-failed",
      }, {
        status: error instanceof AbacatePayError && error.status === 503
          || error instanceof Error && error.message === "abacatepay-api-key-missing"
          ? 503
          : 502,
      });
    }
  } catch (error) {
    console.error("Payment checkout setup failed", error);
    return Response.json({
      error: error instanceof Error && /firebase-admin-/.test(error.message)
        ? "firebase-admin-configuration"
        : "payment-checkout-failed",
    }, { status: 503 });
  }
}
