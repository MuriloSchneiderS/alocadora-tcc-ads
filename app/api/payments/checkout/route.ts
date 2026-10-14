import { randomUUID } from "node:crypto";
import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";
import { createAbacateCheckout, AbacatePayError } from "@/lib/abacate-pay";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { ensureAbacateProduct } from "@/lib/payment-products";

export const runtime = "nodejs";

type CheckoutRequest = {
  originType: "publicacao" | "catalogo";
  originId: string;
  tipo: "aluguel" | "compra" | "assinatura";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCheckoutRequest(value: unknown): value is CheckoutRequest {
  return isRecord(value)
    && (value.originType === "publicacao" || value.originType === "catalogo")
    && typeof value.originId === "string"
    && /^[0-9a-f-]{36}$/i.test(value.originId)
    && (value.tipo === "aluguel" || value.tipo === "compra" || value.tipo === "assinatura")
    && (value.tipo !== "assinatura" || value.originType === "catalogo");
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
    const itemRef = database.collection(body.originType).doc(body.originId);
    const [itemSnapshot, monetizationSnapshot] = await Promise.all([
      itemRef.get(),
      itemRef.collection("monetizacao").doc(body.tipo).get(),
    ]);
    if (!itemSnapshot.exists || !monetizationSnapshot.exists)
      return Response.json({ error: "monetization-not-found" }, { status: 404 });

    const item = itemSnapshot.data() ?? {};
    const monetization = monetizationSnapshot.data() ?? {};
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

    const title = String(item.titulo ?? "Conteúdo").trim() || "Conteúdo";
    const description = String(item.descricao ?? "").trim();
    const transactionId = randomUUID();
    const transactionRef = database.collection("transacao").doc(transactionId);

    try {
      const productId = await ensureAbacateProduct(database, {
        originType: body.originType,
        originId: body.originId,
        monetizationType: body.tipo,
        title,
        description,
        price: Number(monetization.preco),
      });
      const checkout = await createAbacateCheckout({
        productId,
        externalId: transactionId,
        returnUrl: `${appUrl}/painel_controle?pagamento=pendente`,
        completionUrl: `${appUrl}/painel_controle?pagamento=confirmacao`,
        metadata: {
          transactionId,
          buyerId: authentication.user.uid,
          originType: body.originType,
          originId: body.originId,
        },
        subscription: body.tipo === "assinatura",
      });
      await transactionRef.create({
        comprador: authentication.user.uid,
        vendedor: item.criador,
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
        error: error instanceof Error ? error.message : "unknown",
      });
      return Response.json({
        error: error instanceof Error && error.message === "payment-product-provisioning"
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
