import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";

const publicationTypes = new Set(["imagem", "video", "audio", "livro"]);
const monetizationTypes = new Set(["gratuito", "aluguel", "compra"]);

export const runtime = "nodejs";

type ContentRequest = {
  publicationId: string;
  titulo: string;
  descricao: string;
  tipo: string;
  tamanho: number;
  duracao: number;
  arquivo: string;
  miniatura: string;
  catalogos: string[];
  monetizacoes: MonetizationRequest[];
};

type MonetizationRequest = {
  tipo: string;
  preco: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExpectedFilePath(path: unknown, prefix: string) {
  return typeof path === "string"
    && path.startsWith(prefix)
    && /^[a-z0-9]{1,10}$/i.test(path.slice(prefix.length));
}

function isThumbnailUrl(value: unknown, userId: string, publicationId: string) {
  if (value === "") return true;
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    const objectMatch = url.pathname.match(/\/o\/(.+)$/);
    if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com" || !objectMatch)
      return false;

    const objectPath = decodeURIComponent(objectMatch[1]);
    const prefix = `publicacoes/miniaturas/${userId}/${publicationId}/miniatura.`;
    return objectPath.startsWith(prefix) && /^[a-z0-9]{1,10}$/i.test(objectPath.slice(prefix.length));
  } catch {
    return false;
  }
}

function validMonetizations(value: unknown): value is MonetizationRequest[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return false;
  const types = new Set<string>();

  return value.every((item) => {
    if (!isRecord(item) || typeof item.tipo !== "string" || !monetizationTypes.has(item.tipo)
      || typeof item.preco !== "number") return false;
    if (types.has(item.tipo) || !Number.isSafeInteger(item.preco) || item.preco < 0) return false;
    if (item.tipo === "gratuito" && item.preco !== 0) return false;
    if (item.tipo !== "gratuito" && item.preco < 1) return false;
    types.add(item.tipo);
    return true;
  });
}

function isValidContentRequest(value: unknown, userId: string): value is ContentRequest {
  if (!isRecord(value)) return false;
  const publicationId = value.publicationId;
  if (typeof publicationId !== "string" || !/^[0-9a-f-]{36}$/i.test(publicationId)) return false;

  const archivePrefix = `publicacoes/arquivos/${userId}/${publicationId}/arquivo.`;
  return typeof value.titulo === "string" && value.titulo.trim().length > 0 && value.titulo.length <= 200
    && typeof value.descricao === "string" && value.descricao.length <= 5000
    && typeof value.tipo === "string" && publicationTypes.has(value.tipo)
    && typeof value.tamanho === "number" && Number.isSafeInteger(value.tamanho) && value.tamanho >= 0
    && typeof value.duracao === "number" && Number.isFinite(value.duracao) && value.duracao >= 0
    && hasExpectedFilePath(value.arquivo, archivePrefix)
    && typeof value.miniatura === "string" && isThumbnailUrl(value.miniatura, userId, publicationId)
    && Array.isArray(value.catalogos) && value.catalogos.length <= 50
    && value.catalogos.every((catalogId) => typeof catalogId === "string" && catalogId.length <= 128)
    && validMonetizations(value.monetizacoes);
}

function firestoreValue(value: string | number | string[] | boolean) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  return { arrayValue: { values: value.map((item) => ({ stringValue: item })) } };
}

function firestoreFields(fields: Record<string, string | number | string[] | boolean>) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValue(value)]));
}

async function writeFirestore(token: string, projectId: string, writes: unknown[]) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ writes }),
      cache: "no-store",
    },
  );
  const result = await response.json().catch(() => null) as { error?: { status?: string; message?: string } } | null;
  return { response, error: result?.error };
}

export async function POST(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });
  const { user } = authentication;

  const body: unknown = await request.json().catch(() => null);
  if (!isValidContentRequest(body, user.uid))
    return Response.json({ error: "invalid-content" }, { status: 400 });

  const { publicationId } = body;
  const publicationName = `projects/${user.projectId}/databases/(default)/documents/publicacao/${publicationId}`;
  const publicationResult = await writeFirestore(user.idToken, user.projectId, [{
    update: {
      name: publicationName,
      fields: firestoreFields({
        criador: user.uid,
        titulo: body.titulo.trim(),
        descricao: body.descricao.trim(),
        tipo: body.tipo,
        tamanho: body.tamanho,
        duracao: body.duracao,
        arquivo: body.arquivo,
        miniatura: body.miniatura,
        catalogos: body.catalogos.filter((catalogId) => Boolean(catalogId.trim())),
      }),
    },
    updateTransforms: [{ fieldPath: "data_criacao", setToServerValue: "REQUEST_TIME" }],
    currentDocument: { exists: false },
  }]);

  if (!publicationResult.response.ok) {
    console.error("Firestore publication write failed", publicationResult.error?.status ?? publicationResult.response.status);
    return Response.json({ error: publicationResult.response.status === 401 ? "unauthorized" : "content-save-failed" }, {
      status: publicationResult.response.status === 401 ? 401 : publicationResult.response.status === 403 ? 403 : 500,
    });
  }

  const monetizationWrites = body.monetizacoes.map((monetization) => ({
    update: {
      name: `${publicationName}/monetizacao/${monetization.tipo}`,
      fields: firestoreFields({
        tipo: monetization.tipo,
        preco: monetization.preco,
        moeda: "BRL",
        ativo: true,
      }),
    },
    currentDocument: { exists: false },
  }));

  const monetizationResult = await writeFirestore(user.idToken, user.projectId, monetizationWrites);
  if (!monetizationResult.response.ok) {
    console.error("Firestore monetization write failed", monetizationResult.error?.status ?? monetizationResult.response.status);
    return Response.json({ error: monetizationResult.response.status === 401 ? "unauthorized" : "content-save-failed" }, {
      status: monetizationResult.response.status === 401 ? 401 : monetizationResult.response.status === 403 ? 403 : 500,
    });
  }

  return Response.json({ publicationId }, { status: 201 });
}