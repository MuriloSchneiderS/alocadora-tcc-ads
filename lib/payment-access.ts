import "server-only";

import {
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";

export type AccessGrant = {
  active: boolean;
  expiresAt: Date | null;
  type: string;
  originType: string;
  originId: string;
  transactionId: string;
  subscriptionId?: string;
};

export type AcquisitionState = "purchased" | "rented" | "subscribed" | null;

//verifica se a concessão de acesso está ativa, considerando a data atual
function isGrantActive(grant: FirebaseFirestore.DocumentData, now: Date) {
  if (grant.ativo !== true) 
    return false;
  const expiry = grant.expira_em;//se a concessão não expira, ela é considerada ativa
  if (expiry == null) 
    return grant.tipo === "compra";//acesso perpétuo não expira, mas aluguel e assinatura expiram
  const expiryDate = expiry instanceof Timestamp ? expiry.toDate() : expiry instanceof Date ? expiry : null;
  return Boolean(expiryDate && expiryDate > now);
}

//retorna o estado de aquisição do usuário para a publicação/catalogo especificada
export async function getPublicationAcquisitionState(
  database: Firestore,
  userId: string,
  publicationId: string,
  originType?: string,
  originId?: string,
): Promise<AcquisitionState> {
  const grants = await database.collection("acesso").doc(userId)
    .collection("publicacoes").doc(publicationId).collection("fontes").get();
  const activeGrants = grants.docs.map((item) => item.data()).filter((grant) =>
    isGrantActive(grant, new Date())
      && (!originType || grant.origem_tipo === originType)
      && (!originId || grant.origem_id === originId),
  );
  if (activeGrants.some((grant) => grant.tipo === "compra")) return "purchased";
  if (activeGrants.some((grant) => grant.tipo === "assinatura")) return "subscribed";
  if (activeGrants.some((grant) => grant.tipo === "aluguel")) return "rented";
  return null;
}
export async function getCatalogAcquisitionState(
  database: Firestore,
  userId: string,
  catalogId: string,
  publicationIds: string[],
): Promise<AcquisitionState> {
  const states = await Promise.all(publicationIds.map((publicationId) =>
    getPublicationAcquisitionState(database, userId, publicationId, "catalogo", catalogId),
  ));
  if (states.includes("purchased")) return "purchased";
  if (states.includes("subscribed")) return "subscribed";
  if (states.includes("rented")) return "rented";
  return null;
}

//atualiza o estado de aquisição do usuário para a publicação especificada, considerando a concessão de acesso fornecida
export async function updatePublicationEntitlement(
  database: Firestore,
  userId: string,
  publicationId: string,
  grantId: string,
  grant: AccessGrant,
) {
  const publicationAccess = database
    .collection("acesso").doc(userId)
    .collection("publicacoes").doc(publicationId);
  const grantRef = publicationAccess.collection("fontes").doc(grantId);
  const grantsRef = publicationAccess.collection("fontes");

  await database.runTransaction(async (transaction) => {
    const existingGrant = await transaction.get(grantRef);
    const grants = await transaction.get(grantsRef);
    const nextGrant = {
      ativo: grant.active,
      expira_em: grant.expiresAt ? Timestamp.fromDate(grant.expiresAt) : null,
      tipo: grant.type,
      origem_tipo: grant.originType,
      origem_id: grant.originId,
      transacao: grant.transactionId,
      ...(grant.subscriptionId ? { assinatura_id: grant.subscriptionId } : {}),
      atualizado_em: FieldValue.serverTimestamp(),
    };
    const candidates = grants.docs
      .filter((item) => item.id !== grantId && item.data().ativo === true)
      .map((item) => item.data().expira_em as Timestamp | null | undefined);
    if (grant.active)
      candidates.push(grant.expiresAt ? Timestamp.fromDate(grant.expiresAt) : null);

    const hasPerpetualGrant = candidates.some((expiresAt) => expiresAt == null);
    const latestExpiry = candidates.reduce<Date | null>((latest, expiresAt) => {
      if (!expiresAt) return latest;
      const date = expiresAt instanceof Timestamp ? expiresAt.toDate() : null;
      return date && (!latest || date > latest) ? date : latest;
    }, null);
    const active = hasPerpetualGrant || Boolean(latestExpiry && latestExpiry > new Date());

    transaction.set(grantRef, nextGrant, { merge: true });
    transaction.set(publicationAccess, {
      ativo: active,
      expira_em: hasPerpetualGrant ? null : latestExpiry ? Timestamp.fromDate(latestExpiry) : null,
      atualizado_em: FieldValue.serverTimestamp(),
      ...(!existingGrant.exists ? { criado_em: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
  });
}

export function addCalendarMonth(value: Date) {
  const next = new Date(value);
  const targetDay = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(targetDay, lastDay));
  return next;
}
