import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { createAbacateProduct } from "./abacate-pay";

type ProductInput = {
  originType: "publicacao" | "catalogo";
  originId: string;
  monetizationType: "aluguel" | "compra" | "assinatura";
  title: string;
  description: string;
  price: number;
};

function productHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function ensureAbacateProduct(database: Firestore, input: ProductInput) {
  const recurring = input.monetizationType === "assinatura";
  const key = productHash(`${input.originType}:${input.originId}:${input.monetizationType}`);
  const version = productHash(`${input.price}:${recurring ? "MONTHLY" : "ONCE"}:${input.title}:${input.description}`);
  const productRef = database.collection("produto_gateway").doc(key);
  const requestId = randomUUID();
  const lockUntil = Date.now() + 120_000;

  const existingProductId = await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(productRef);
    const data = snapshot.data();
    if (data?.versao === version && typeof data.produto_id === "string")
      return data.produto_id;
    if (data?.status === "criando" && Number(data.lock_ate ?? 0) > Date.now())
      throw new Error("payment-product-provisioning");

    transaction.set(productRef, {
      origem_tipo: input.originType,
      origem_id: input.originId,
      tipo: input.monetizationType,
      versao: version,
      status: "criando",
      produto_id: null,
      lock_id: requestId,
      lock_ate: lockUntil,
      atualizado_em: new Date(),
    }, { merge: true });
    return null;
  });
  if (existingProductId) return existingProductId;

  try {
    const product = await createAbacateProduct({
      externalId: `alocadora-${key}-${version.slice(0, 16)}`,
      name: input.title.trim().slice(0, 120),
      description: input.description.trim().slice(0, 500),
      price: input.price,
      ...(recurring ? { cycle: "MONTHLY" as const } : {}),
    });
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(productRef);
      if (snapshot.data()?.lock_id !== requestId)
        throw new Error("payment-product-lock-lost");
      transaction.set(productRef, {
        produto_id: product.id,
        status: "ativo",
        lock_id: null,
        lock_ate: null,
        atualizado_em: new Date(),
      }, { merge: true });
    });
    return product.id;
  } catch (error) {
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(productRef);
      if (snapshot.data()?.lock_id === requestId)
        transaction.set(productRef, {
          status: "erro",
          lock_id: null,
          lock_ate: null,
          atualizado_em: new Date(),
        }, { merge: true });
    }).catch((releaseError) => {
      console.error("Abacate Pay product lock release failed", releaseError);
    });
    throw error;
  }
}
