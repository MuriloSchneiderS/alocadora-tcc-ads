import { Readable } from "node:stream";
import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";
import { getAdminFirestore, getAdminStorageBucket } from "@/lib/firebase-admin";
import { getPublicationAcquisitionState } from "@/lib/payment-access";

export const runtime = "nodejs";

function isId(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f-]{36}$/i.test(value));
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|\r\n]/g, "-").trim() || "publicacao";
}

//retorna o arquivo da publicação especificada, caso o usuário tenha adquirido a publicação
export async function GET(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });

  const params = new URL(request.url).searchParams;
  const publicationId = params.get("publicationId");
  const originType = params.get("originType");
  const originId = params.get("originId");
  if (!isId(publicationId)
    || (originType !== "publicacao" && originType !== "catalogo")
    || !isId(originId))
    return Response.json({ error: "invalid-download" }, { status: 400 });

  try {
    const database = getAdminFirestore(authentication.user.projectId);
    const publicationSnapshot = await database.collection("publicacao").doc(publicationId).get();
    if (!publicationSnapshot.exists)
      return Response.json({ error: "publication-not-found" }, { status: 404 });

    //verifica se a publicação pertence ao catálogo especificado, caso o download seja solicitado a partir de um catálogo
    if (originType === "catalogo") {
      const catalogSnapshot = await database.collection("catalogo").doc(originId).get();
      const catalogPublications = catalogSnapshot.data()?.publicacoes;
      if (!catalogSnapshot.exists || !Array.isArray(catalogPublications) || !catalogPublications.includes(publicationId))
        return Response.json({ error: "publication-not-in-catalog" }, { status: 404 });
    } else if (originId !== publicationId) {
      return Response.json({ error: "invalid-download" }, { status: 400 });
    }

    const acquisition = originType === "catalogo"
      ? await getPublicationAcquisitionState(
        database,
        authentication.user.uid,
        publicationId,
        originType,
        originId,
      )
      : await getPublicationAcquisitionState(database, authentication.user.uid, publicationId);
    if (acquisition !== "purchased")//se o usuário não adquiriu a publicação, retorna erro de acesso negado
      return Response.json({ error: "purchase-required" }, { status: 403 });

    const publication = publicationSnapshot.data() ?? {};
    const creatorId = typeof publication.criador === "string" ? publication.criador : "";
    const archivePath = typeof publication.arquivo === "string" ? publication.arquivo : "";
    const expectedPrefix = `publicacoes/arquivos/${creatorId}/${publicationId}/`;
    if (!creatorId || !archivePath.startsWith(expectedPrefix))
      return Response.json({ error: "invalid-archive-path" }, { status: 409 });

    const bucket = getAdminStorageBucket(authentication.user.projectId);
    const file = bucket.file(archivePath);
    const [exists] = await file.exists();
    if (!exists) return Response.json({ error: "file-not-found" }, { status: 404 });
    const [metadata] = await file.getMetadata();
    const filename = `${safeFilename(String(publication.titulo ?? "publicacao"))}.${archivePath.split(".").pop()?.toLowerCase() || "bin"}`;
    const fallbackFilename = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "-");
    const encodedFilename = encodeURIComponent(filename).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    const stream = Readable.toWeb(file.createReadStream()) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Content-Type": typeof metadata.contentType === "string" ? metadata.contentType : "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`,
        "Cache-Control": "private, no-store",
        ...(metadata.size ? { "Content-Length": String(metadata.size) } : {}),
      },
    });
  } catch (error) {
    console.error("Authorized content download failed", error);
    return Response.json({ error: "download-unavailable" }, { status: 503 });
  }
}