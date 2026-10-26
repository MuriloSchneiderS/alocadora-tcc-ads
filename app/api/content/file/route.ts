import { Readable } from "node:stream";
import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";
import { getAdminFirestore, getAdminStorageBucket } from "@/lib/firebase-admin";
import { getPublicationAcquisitionState } from "@/lib/payment-access";

export const runtime = "nodejs";

function isId(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f-]{36}$/i.test(value));
}
//rota para acessar o arquivo de uma publicação, com autenticação e verificação de acesso
export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  let user: { uid: string; projectId: string } | null = null;
  if (authorization) {
    const authentication = await authenticateFirebaseRequest(request);
    if (!authentication.ok)
      return Response.json({ error: authentication.error }, { status: authentication.status });
    user = authentication.user;
  }

  const publicationId = new URL(request.url).searchParams.get("publicationId");
  if (!isId(publicationId))
    return Response.json({ error: "invalid-publication" }, { status: 400 });

  try {
    const database = getAdminFirestore(user?.projectId);
    const publicationSnapshot = await database.collection("publicacao").doc(publicationId).get();
    if (!publicationSnapshot.exists)
      return Response.json({ error: "publication-not-found" }, { status: 404 });

    const publication = publicationSnapshot.data() ?? {};
    const creatorId = typeof publication.criador === "string" ? publication.criador : "";
    const archivePath = typeof publication.arquivo === "string" ? publication.arquivo : "";
    const expectedPrefix = `publicacoes/arquivos/${creatorId}/${publicationId}/`;
    if (!creatorId || !archivePath.startsWith(expectedPrefix))
      return Response.json({ error: "invalid-archive-path" }, { status: 409 });

    const freeAccess = await database.collection("publicacao").doc(publicationId)
      .collection("monetizacao").doc("gratuito").get();
    const isFree = freeAccess.exists
      && freeAccess.data()?.ativo === true
      && freeAccess.data()?.preco === 0;
    const hasAccess = user?.uid === creatorId
      || isFree
      || Boolean(user && await getPublicationAcquisitionState(database, user.uid, publicationId));
    if (!hasAccess)
      return Response.json({ error: "access-required" }, { status: 403 });

    const file = getAdminStorageBucket(user?.projectId).file(archivePath);
    const [exists] = await file.exists();
    if (!exists)
      return Response.json({ error: "file-not-found" }, { status: 404 });

    const [metadata] = await file.getMetadata();
    const stream = Readable.toWeb(file.createReadStream()) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Content-Type": typeof metadata.contentType === "string" ? metadata.contentType : "application/octet-stream",
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(metadata.size ? { "Content-Length": String(metadata.size) } : {}),
      },
    });
  } catch (error) {
    console.error("Authorized content preview failed", error);
    return Response.json({ error: "content-unavailable" }, { status: 503 });
  }
}