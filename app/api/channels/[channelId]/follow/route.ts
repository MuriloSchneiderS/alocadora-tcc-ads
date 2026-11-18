import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { DEFAULT_CHANNEL_TITLE, DEFAULT_USER_AVATAR } from "@/lib/user-profile";
import { FieldPath, FieldValue, Timestamp, type QueryDocumentSnapshot } from "firebase-admin/firestore";

export const runtime = "nodejs";

const PAGE_SIZE = 12;
type FollowList = "followers" | "following";

type FollowCursor = {
  version: 1;
  channelId: string;
  list: FollowList;
  seconds: number;
  nanoseconds: number;
  id: string;
};

type RouteContext = { params: Promise<{ channelId: string }> };//conteúdo do parâmetro de rota, que contém o ID do canal a ser seguido ou deixado de seguir

//verifica se o channelId é válido (não vazio, não muito longo e sem barras)
function isValidChannelId(channelId: string) {
  return channelId.length > 0 && channelId.length <= 128 && !channelId.includes("/");
}
//verifica se o valor é uma lista de seguidores ou seguindo
function isFollowList(value: string | null): value is FollowList {
  return value === "followers" || value === "following";
}
//decodifica o cursor de paginação da lista de seguidores ou seguindo, verificando se ele é válido e corresponde ao canal e à lista corretos
function decodeCursor(value: string | null, channelId: string, list: FollowList): FollowCursor | null {
  if (!value || value.length > 2048) return null;
  try {
    const cursor: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return null;
    const candidate = cursor as Record<string, unknown>;
    if (candidate.version !== 1 || candidate.channelId !== channelId || candidate.list !== list
      || typeof candidate.seconds !== "number" || !Number.isSafeInteger(candidate.seconds)
      || typeof candidate.nanoseconds !== "number" || !Number.isInteger(candidate.nanoseconds)
      || candidate.nanoseconds < 0 || candidate.nanoseconds >= 1_000_000_000
      || typeof candidate.id !== "string" || candidate.id.length === 0 || candidate.id.length > 256)
      return null;
    return candidate as FollowCursor;
  } catch {
    return null;
  }
}
//codifica o cursor de paginação da lista de seguidores ou seguindo em uma string base64url, para ser usada na URL
function encodeListCursor(snapshot: QueryDocumentSnapshot, channelId: string, list: FollowList) {
  const createdAt = snapshot.get("data_criacao");
  if (!(createdAt instanceof Timestamp))
    throw new Error("follow-document-timestamp-invalid");
  const cursor: FollowCursor = {
    version: 1,
    channelId,
    list,
    seconds: createdAt.seconds,
    nanoseconds: createdAt.nanoseconds,
    id: snapshot.id,
  };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
//gera um ID de relacionamento entre o seguidor e o canal, codificando os dois IDs em base64url
function relationshipId(followerId: string, channelId: string) {
  return Buffer.from(JSON.stringify([followerId, channelId])).toString("base64url");
}
//JSON com cabeçalho "Cache-Control: no-store", para evitar cache de dados sensíveis
function noStoreJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

//resposta da API para a lista de seguidores ou seguindo, contendo os itens, o total e o cursor da próxima página
//chamado quando o usuário autenticado solicita a lista de seguidores ou seguindo de um canal
export async function GET(request: Request, { params }: RouteContext) {
  const { channelId } = await params;
  if (!isValidChannelId(channelId))
    return noStoreJson({ error: "invalid-channel" }, 400);

  const searchParams = new URL(request.url).searchParams;
  const listParam = searchParams.get("list");
  const cursorParam = searchParams.get("cursor");
  if ((listParam && !isFollowList(listParam)) || (cursorParam && !listParam))
    return noStoreJson({ error: "invalid-follow-query" }, 400);

  let userId: string | null = null;
  if (request.headers.has("authorization")) {
    const authentication = await authenticateFirebaseRequest(request);
    if (!authentication.ok)
      return noStoreJson({ error: authentication.error }, authentication.status);
    userId = authentication.user.uid;
  }

  //verifica se a lista de seguidores ou seguindo é válida e se o usuário autenticado tem permissão para acessá-la
  const list = isFollowList(listParam) ? listParam : null;
  if (list) {
    if (!userId)
      return noStoreJson({ error: "unauthorized" }, 401);
    if (userId !== channelId)
      return noStoreJson({ error: "forbidden" }, 403);
  }

  const cursor = list ? decodeCursor(cursorParam, channelId, list) : null;
  if (cursorParam && !cursor)
    return noStoreJson({ error: "invalid-follow-cursor" }, 400);

  try {
    const database = getAdminFirestore();
    const channelRef = database.collection("usuario").doc(channelId);
    const channelSnapshot = await channelRef.get();
    if (!channelSnapshot.exists)
      return noStoreJson({ error: "channel-not-found" }, 404);

    const relationships = database.collection("canal_seguindo");
    const followersQuery = relationships.where("canal", "==", channelId);
    const followingQuery = relationships.where("seguidor", "==", channelId);
    const [followersCountSnapshot, followingCountSnapshot] = await Promise.all([
      followersQuery.count().get(),
      followingQuery.count().get(),
    ]);

    if (!list) {
      let isFollowing = false;
      if (userId && userId !== channelId) {
        const relationship = await relationships.doc(relationshipId(userId, channelId)).get();
        isFollowing = relationship.exists;
      }
      return noStoreJson({
        followers: followersCountSnapshot.data().count,
        following: followingCountSnapshot.data().count,
        isFollowing,
      });
    }

    let query = list === "followers" ? followersQuery : followingQuery;
    query = query.orderBy("data_criacao", "desc").orderBy(FieldPath.documentId(), "desc");
    if (cursor) {
      query = query.startAfter(
        new Timestamp(cursor.seconds, cursor.nanoseconds),
        cursor.id,
      );
    }

    const snapshot = await query.limit(PAGE_SIZE + 1).get();
    const documents = snapshot.docs.slice(0, PAGE_SIZE);
    const channelIds = documents.map((document) =>
      String(document.get(list === "followers" ? "seguidor" : "canal") ?? ""),
    );
    const profiles = await Promise.all(channelIds.map((id) =>
      database.collection("usuario").doc(id).get(),
    ));
    const items = profiles.flatMap((profile, index) => {
      if (!profile.exists) return [];
      const data = profile.data() ?? {};
      const id = channelIds[index];
      return [{
        id,
        type: "channel" as const,
        name: String(data.nome ?? "Criador"),
        title: String(data.titulo || DEFAULT_CHANNEL_TITLE),
        description: String(data.descricao ?? ""),
        avatar: String(data.avatar || DEFAULT_USER_AVATAR),
        href: `/canal/${encodeURIComponent(id)}`,
      }];
    });

    return noStoreJson({
      items,
      total: list === "followers"
        ? followersCountSnapshot.data().count
        : followingCountSnapshot.data().count,
      nextCursor: snapshot.docs.length > PAGE_SIZE && documents.length > 0
        ? encodeListCursor(documents[documents.length - 1], channelId, list)
        : null,
    });
  } catch (error) {
    console.error("Channel follow data could not be loaded", {
      channelId,
      list,
      error: error instanceof Error ? error.message : "unknown",
    });
    return noStoreJson({ error: "follow-data-unavailable" }, 503);
  }
}

//botão SEGUIR, que cria a relação de seguidor entre o usuário autenticado e o canal especificado
export async function POST(request: Request, { params }: RouteContext) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return noStoreJson({ error: authentication.error }, authentication.status);

  const { channelId } = await params;
  if (!isValidChannelId(channelId))
    return noStoreJson({ error: "invalid-channel" }, 400);
  if (authentication.user.uid === channelId)
    return noStoreJson({ error: "cannot-follow-self" }, 400);

  try {
    const database = getAdminFirestore(authentication.user.projectId);
    const channelRef = database.collection("usuario").doc(channelId);
    const relationshipRef = database.collection("canal_seguindo")
      .doc(relationshipId(authentication.user.uid, channelId));
    const channelExists = await database.runTransaction(async (transaction) => {
      const channel = await transaction.get(channelRef);
      if (!channel.exists) return false;
      const relationship = await transaction.get(relationshipRef);
      if (!relationship.exists) {
        transaction.create(relationshipRef, {
          seguidor: authentication.user.uid,
          canal: channelId,
          data_criacao: FieldValue.serverTimestamp(),
        });
      }
      return true;
    });
    if (!channelExists)
      return noStoreJson({ error: "channel-not-found" }, 404);
    return noStoreJson({ isFollowing: true });
  } catch (error) {
    console.error("Channel follow could not be created", {
      channelId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return noStoreJson({ error: "follow-unavailable" }, 503);
  }
}
//botão SEGUINDO, que remove a relação de seguidor entre o usuário autenticado e o canal especificado
export async function DELETE(request: Request, { params }: RouteContext) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return noStoreJson({ error: authentication.error }, authentication.status);

  const { channelId } = await params;
  if (!isValidChannelId(channelId))
    return noStoreJson({ error: "invalid-channel" }, 400);
  if (authentication.user.uid === channelId)
    return noStoreJson({ error: "cannot-follow-self" }, 400);

  try {
    const database = getAdminFirestore(authentication.user.projectId);
    const channel = await database.collection("usuario").doc(channelId).get();
    if (!channel.exists)
      return noStoreJson({ error: "channel-not-found" }, 404);

    await database.collection("canal_seguindo")
      .doc(relationshipId(authentication.user.uid, channelId))
      .delete();
    return noStoreJson({ isFollowing: false });
  } catch (error) {
    console.error("Channel follow could not be removed", {
      channelId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return noStoreJson({ error: "unfollow-unavailable" }, 503);
  }
}
