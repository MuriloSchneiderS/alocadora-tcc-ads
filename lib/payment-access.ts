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
