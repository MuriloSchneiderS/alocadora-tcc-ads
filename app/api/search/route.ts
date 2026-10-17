import { FieldPath, Timestamp, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { DEFAULT_CHANNEL_TITLE, DEFAULT_USER_AVATAR } from "@/lib/user-profile";

export const runtime = "nodejs";

const PAGE_SIZE = 12;
const emptyCatalogThumbnail = "/assets/catalogo_vazio.png";
type ContentCollection = "publicacao" | "catalogo";

type CursorPosition = {
  seconds?: number;
  nanoseconds?: number;
  id?: string;
  name?: string;
};

type SourceCursor = {
  last: CursorPosition | null;
  done: boolean;
};

type SearchCursor = {
  version: 1;
  query: string;
  channelId: string;
  publication: SourceCursor;
  catalog: SourceCursor;
  channel: SourceCursor;
};

function emptySourceCursor(done = false): SourceCursor {
  return { last: null, done };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

//verifica se o valor é um cursor de pesquisa válido, com base no tipo de cursor (timestamp ou name)
function isSourceCursor(value: unknown, kind: "timestamp" | "name"): value is SourceCursor {
  if (!isRecord(value) || typeof value.done !== "boolean") return false;
  if (value.last === null) return true;
  if (!isRecord(value.last) || typeof value.last.id !== "string" || value.last.id.length > 128) return false;
  if (kind === "name") return typeof value.last.name === "string" && value.last.name.length <= 200;
  return typeof value.last.seconds === "number" && Number.isSafeInteger(value.last.seconds)
    && typeof value.last.nanoseconds === "number" && Number.isInteger(value.last.nanoseconds)
    && value.last.nanoseconds >= 0 && value.last.nanoseconds < 1_000_000_000;
}

//decodifica o cursor de pesquisa a partir do valor codificado em base64url, verificando se ele é válido e corresponde à query e ao canal fornecidos
function decodeCursor(value: string | null, query: string, channelId: string): SearchCursor | null {
  if (!value || value.length > 4096) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    //verifica se o cursor é um objeto válido, com a versão correta, a query e o canal correspondentes, e se os cursors de publicação, catálogo e canal são válidos
    if (!isRecord(cursor) || cursor.version !== 1 || cursor.query !== query || cursor.channelId !== channelId
      || !isSourceCursor(cursor.publication, "timestamp") || !isSourceCursor(cursor.catalog, "timestamp")
      || !isSourceCursor(cursor.channel, "name"))
      return null;
    return cursor as SearchCursor;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: SearchCursor) {
  //retorna o cursor codificado em base64url para ser usado como parâmetro de consulta na URL
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function searchableText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function matchesSearch(values: unknown[], query: string) {
  return !query || values.some((value) => searchableText(value).includes(query));
}

function timestampMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" ? value : 0;
}

//formata a duração em segundos para o formato "hh:mm:ss" ou "mm:ss", dependendo do valor
function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatMonetization(item: Record<string, unknown>) {
  const type = String(item.tipo ?? "");
  if (type === "gratuito") return { label: "Acesso gratuito", price: "Grátis" };

  const price = `R$${(Number(item.preco ?? 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  if (type === "aluguel") return { label: `Alugue por ${Number(item.duracao ?? 7)} dias`, price };
  if (type === "assinatura") return { label: "Assine", price };
  return { label: "Compre", price };
}

function monetizationName(type: string) {
  if (type === "gratuito") return "Gratuito";
  if (type === "aluguel") return "Aluguel";
  if (type === "assinatura") return "Assinatura";
  return "Compra";
}

function cursorForDocument(snapshot: QueryDocumentSnapshot): CursorPosition {
  const createdAt = snapshot.get("data_criacao");
  const timestamp = createdAt instanceof Timestamp ? createdAt : Timestamp.fromMillis(timestampMillis(createdAt));
  return {
    seconds: timestamp.seconds,
    nanoseconds: timestamp.nanoseconds,
    id: snapshot.id,
  };
}

function cursorForChannel(snapshot: QueryDocumentSnapshot): CursorPosition {
  return { name: String(snapshot.get("nome") ?? ""), id: snapshot.id };
}

function withContentCursor(position: CursorPosition) {
  const timestamp = new Timestamp(position.seconds ?? 0, position.nanoseconds ?? 0);
  return { timestamp, id: position.id ?? "" };
}

async function fetchContentPage(
  collection: ContentCollection,
  channelId: string,
  sourceCursor: SourceCursor,
) {
  if (sourceCursor.done) return { docs: [], hasMore: false };

  const database = getAdminFirestore();
  let query: Query = database.collection(collection);
  if (channelId) query = query.where("criador", "==", channelId);
  query = query.orderBy("data_criacao", "desc").orderBy(FieldPath.documentId(), "desc");

  if (sourceCursor.last) {
    const cursor = withContentCursor(sourceCursor.last);
    query = query.startAfter(cursor.timestamp, cursor.id);
  }

  const snapshot = await query.limit(PAGE_SIZE + 1).get();
  return {
    docs: snapshot.docs.slice(0, PAGE_SIZE),
    hasMore: snapshot.docs.length > PAGE_SIZE,
  };
}

async function fetchChannelPage(sourceCursor: SourceCursor) {
  if (sourceCursor.done) return { docs: [], hasMore: false };
  const database = getAdminFirestore();
  let query: Query = database.collection("usuario")
    .orderBy("nome", "asc")
    .orderBy(FieldPath.documentId(), "asc");

  if (sourceCursor.last)
    query = query.startAfter(sourceCursor.last.name ?? "", sourceCursor.last.id ?? "");

  const snapshot = await query.limit(PAGE_SIZE + 1).get();
  return {
    docs: snapshot.docs.slice(0, PAGE_SIZE),
    hasMore: snapshot.docs.length > PAGE_SIZE,
  };
}

function nextSourceCursor(
  previous: SourceCursor,
  docs: QueryDocumentSnapshot[],
  hasMore: boolean,
  cursorForDoc: (snapshot: QueryDocumentSnapshot) => CursorPosition,
): SourceCursor {
  return {
    last: docs.length > 0 ? cursorForDoc(docs[docs.length - 1]) : previous.last,
    done: !hasMore,
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = searchableText(params.get("q")?.trim() ?? "");
  const channelId = params.get("channelId")?.trim() ?? "";
  const rawCursor = params.get("cursor");

  if (query.length > 100 || channelId.length > 128)
    return Response.json({ error: "invalid-search" }, { status: 400 });

  const cursor = decodeCursor(rawCursor, query, channelId);
  if (rawCursor && !cursor)
    return Response.json({ error: "invalid-cursor" }, { status: 400 });

  const currentCursor = cursor ?? {
    version: 1 as const,
    query,
    channelId,
    publication: emptySourceCursor(),
    catalog: emptySourceCursor(),
    channel: emptySourceCursor(!query || Boolean(channelId)),
  };

  try {
    const [publicationPage, catalogPage, channelPage] = await Promise.all([
      fetchContentPage("publicacao", channelId, currentCursor.publication),
      fetchContentPage("catalogo", channelId, currentCursor.catalog),
      query && !channelId ? fetchChannelPage(currentCursor.channel) : Promise.resolve({ docs: [], hasMore: false }),
    ]);

    const matchingPublications = publicationPage.docs.filter((snapshot) => {
      const data = snapshot.data();
      return matchesSearch([data.titulo, data.descricao], query);
    });
    const matchingCatalogs = catalogPage.docs.filter((snapshot) => {
      const data = snapshot.data();
      return matchesSearch([data.titulo, data.descricao], query);
    });
    const matchingChannels = channelPage.docs.filter((snapshot) => {
      const data = snapshot.data();
      return matchesSearch([data.nome, data.titulo, data.descricao], query);
    });

    const mediaDocuments = [
      ...matchingPublications.map((snapshot) => ({ snapshot, collection: "publicacao" as const })),
      ...matchingCatalogs.map((snapshot) => ({ snapshot, collection: "catalogo" as const })),
    ];
    const creatorIds = [...new Set(mediaDocuments
      .map(({ snapshot }) => String(snapshot.get("criador") ?? ""))
      .filter(Boolean))];
    const database = getAdminFirestore();
    const profiles = new Map<string, Record<string, unknown>>();
    await Promise.all(creatorIds.map(async (creatorId) => {
      const profile = await database.collection("usuario").doc(creatorId).get();
      if (profile.exists) profiles.set(creatorId, profile.data() ?? {});
    }));

    const mediaItems = await Promise.all(mediaDocuments.map(async ({ snapshot, collection }) => {
      const data = snapshot.data();
      const creatorId = String(data.criador ?? "");
      const profile = profiles.get(creatorId);
      const monetizationSnapshot = await database.collection(collection).doc(snapshot.id)
        .collection("monetizacao").get();
      const monetizations = monetizationSnapshot.docs.map((item) => item.data());
      const publications = Array.isArray(data.publicacoes) ? data.publicacoes : [];
      const type = collection === "publicacao" ? "publication" : "catalog";

      return {
        id: snapshot.id,
        type,
        createdAt: timestampMillis(data.data_criacao),
        title: String(data.titulo ?? "Sem título"),
        description: String(data.descricao ?? ""),
        thumbnail: String(data.miniatura || emptyCatalogThumbnail),
        duration: type === "publication" ? formatDuration(Number(data.duracao ?? 0)) : `${publications.length} itens`,
        href: type === "publication"
          ? `/exibicao?publicationId=${encodeURIComponent(snapshot.id)}`
          : `/catalogo/${encodeURIComponent(snapshot.id)}`,
        monetizations: monetizations.map((item) => monetizationName(String(item.tipo ?? ""))),
        acquisitions: monetizations.map(formatMonetization),
        channel: {
          channelId: creatorId,
          name: String(profile?.nome ?? "Criador"),
          title: String(profile?.titulo || DEFAULT_CHANNEL_TITLE),
          avatar: String(profile?.avatar || DEFAULT_USER_AVATAR),
        },
      };
    }));

    const channels = matchingChannels.map((snapshot) => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        type: "channel" as const,
        name: String(data.nome ?? "Criador"),
        title: String(data.titulo || DEFAULT_CHANNEL_TITLE),
        description: String(data.descricao ?? ""),
        avatar: String(data.avatar || DEFAULT_USER_AVATAR),
        href: `/canal/${encodeURIComponent(snapshot.id)}`,
      };
    });

    const items = [...mediaItems, ...channels].sort((first, second) => {
      const firstCreatedAt = "createdAt" in first ? first.createdAt : 0;
      const secondCreatedAt = "createdAt" in second ? second.createdAt : 0;
      return secondCreatedAt - firstCreatedAt || first.id.localeCompare(second.id);
    });

    const nextCursor: SearchCursor = {
      ...currentCursor,
      publication: nextSourceCursor(currentCursor.publication, publicationPage.docs, publicationPage.hasMore,
        cursorForDocument),
      catalog: nextSourceCursor(currentCursor.catalog, catalogPage.docs, catalogPage.hasMore,
        cursorForDocument),
      channel: query && !channelId
        ? nextSourceCursor(currentCursor.channel, channelPage.docs, channelPage.hasMore, cursorForChannel)
        : emptySourceCursor(true),
    };
    const hasMore = !nextCursor.publication.done || !nextCursor.catalog.done || !nextCursor.channel.done;

    return Response.json({
      items,
      nextCursor: hasMore ? encodeCursor(nextCursor) : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Search page could not be loaded", error);
    return Response.json({ error: "search-unavailable" }, { status: 500 });
  }
}
