import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getCatalogAcquisitionState, getPublicationAcquisitionState } from "@/lib/payment-access";

export const runtime = "nodejs";

function isId(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f-]{36}$/i.test(value));
}

//retorna o estado de aquisição do usuário para a publicação ou catálogo especificado
export async function GET(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });

  const params = new URL(request.url).searchParams;
  const originType = params.get("originType");
  const originId = params.get("originId");
  if ((originType !== "publicacao" && originType !== "catalogo") || !isId(originId))
    return Response.json({ error: "invalid-content" }, { status: 400 });

  try {
    const database = getAdminFirestore(authentication.user.projectId);
    const snapshot = await database.collection(originType).doc(originId).get();
    if (!snapshot.exists) return Response.json({ error: "content-not-found" }, { status: 404 });
    const data = snapshot.data() ?? {};
    const state = originType === "publicacao"
      ? await getPublicationAcquisitionState(database, authentication.user.uid, originId)
      : await getCatalogAcquisitionState(
        database,
        authentication.user.uid,
        originId,
        Array.isArray(data.publicacoes)
          ? data.publicacoes.filter((id: unknown): id is string => typeof id === "string")
          : [],
      );
    return Response.json({ state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Payment access lookup failed", error);
    return Response.json({ error: "payment-access-unavailable" }, { status: 503 });
  }
}