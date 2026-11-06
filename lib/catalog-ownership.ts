import "server-only";

import type { Firestore } from "firebase-admin/firestore";

//verifica se o valor é uma lista de IDs de publicações válidos
export function isPublicationIdList(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.every((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))
    && new Set(value).size === value.length;
}
//verifica se todas as publicações pertencem ao criador especificado
export async function publicationsBelongToCreator(
  database: Firestore,
  publicationIds: string[],
  creatorId: string,
) {
  if (publicationIds.length === 0 || !isPublicationIdList(publicationIds))
    return false;

  for (let index = 0; index < publicationIds.length; index += 100) {
    const references = publicationIds
      .slice(index, index + 100)
      .map((publicationId) => database.collection("publicacao").doc(publicationId));
    const snapshots = await database.getAll(...references);
    if (snapshots.some((snapshot) => !snapshot.exists || snapshot.get("criador") !== creatorId))
      return false;
  }

  return true;
}
