import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";

const publicationTypes = new Set(["imagem", "video", "audio", "livro"]);
const monetizationTypes = new Set(["gratuito", "aluguel", "compra"]);
const emptyCatalogThumbnail = "/assets/catalogo_vazio.png";

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
  if (typeof path !== "string" || !path.startsWith(prefix.slice(0, prefix.lastIndexOf("arquivo.")))) return false;
  const filename = path.slice(prefix.lastIndexOf("arquivo."));
  return /^arquivo(?:-[0-9a-f-]{36})?\.[a-z0-9]{1,10}$/i.test(filename);
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
    const prefix = `publicacoes/miniaturas/${userId}/${publicationId}/`;
    return objectPath.startsWith(prefix)
      && /^miniatura(?:-[0-9a-f-]{36})?\.[a-z0-9]{1,10}$/i.test(objectPath.slice(prefix.length));
  } catch {
    return false;
  }
}

async function readCatalog(token: string, projectId: string, catalogId: string) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/catalogo/${encodeURIComponent(catalogId)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  const document = await response.json().catch(() => null) as {
    fields?: Record<string, {
      stringValue?: string;
      arrayValue?: { values?: { stringValue?: string }[] };
    }>;
    updateTime?: string;
    error?: { status?: string };
  } | null;
  return { response, document };
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
    && value.catalogos.every((catalogId) => typeof catalogId === "string" && catalogId.length > 0 && catalogId.length <= 128)
    && new Set(value.catalogos).size === value.catalogos.length
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
  let catalogSnapshots: Awaited<ReturnType<typeof readCatalog>>[];
  try {
    catalogSnapshots = await Promise.all(body.catalogos.map((catalogId) => readCatalog(user.idToken, user.projectId, catalogId)));
  } catch {
    return Response.json({ error: "firebase-unavailable" }, { status: 503 });
  }

  for (const catalogSnapshot of catalogSnapshots) {
    if (catalogSnapshot.response.status === 404)
      return Response.json({ error: "catalog-not-found" }, { status: 400 });
    if (!catalogSnapshot.response.ok) {
      console.error("Firestore catalog read failed", catalogSnapshot.document?.error?.status ?? catalogSnapshot.response.status);
      return Response.json({ error: catalogSnapshot.response.status === 401 ? "unauthorized" : "catalog-read-failed" }, {
        status: catalogSnapshot.response.status === 401 ? 401 : 500,
      });
    }
    if (catalogSnapshot.document?.fields?.criador?.stringValue !== user.uid)
      return Response.json({ error: "forbidden-catalog" }, { status: 403 });
    if (!catalogSnapshot.document.updateTime)
      return Response.json({ error: "catalog-read-failed" }, { status: 500 });
  }

  const catalogWrites = catalogSnapshots.map(({ document }, index) => {
    const fields = document?.fields ?? {};
    const publicationIds = fields.publicacoes?.arrayValue?.values?.map((item) => item.stringValue ?? "") ?? [];
    const thumbnail = publicationIds.length === 0
      ? body.miniatura || emptyCatalogThumbnail
      : fields.miniatura?.stringValue || emptyCatalogThumbnail;
    return {
      update: {
        name: `projects/${user.projectId}/databases/(default)/documents/catalogo/${body.catalogos[index]}`,
        fields: firestoreFields({ publicacoes: [...publicationIds, publicationId], miniatura: thumbnail }),
      },
      updateMask: { fieldPaths: ["publicacoes", "miniatura"] },
      currentDocument: { updateTime: document?.updateTime },
    };
  });

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
  }, ...catalogWrites]);

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

export async function PATCH(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });
  const { user } = authentication;
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.publicationId !== "string"
    || !/^[0-9a-f-]{36}$/i.test(body.publicationId)
    || typeof body.titulo !== "string" || !body.titulo.trim() || body.titulo.length > 200
    || typeof body.descricao !== "string" || body.descricao.length > 5000
    || typeof body.tipo !== "string" || !publicationTypes.has(body.tipo)
    || typeof body.tamanho !== "number" || !Number.isSafeInteger(body.tamanho) || body.tamanho < 0
    || typeof body.duracao !== "number" || !Number.isFinite(body.duracao) || body.duracao < 0
    || !hasExpectedFilePath(body.arquivo, `publicacoes/arquivos/${user.uid}/${body.publicationId}/arquivo.`)
    || typeof body.miniatura !== "string" || !isThumbnailUrl(body.miniatura, user.uid, body.publicationId)
    || !Array.isArray(body.catalogos) || body.catalogos.length > 50
    || !body.catalogos.every((catalogId) => typeof catalogId === "string" && catalogId.length > 0 && catalogId.length <= 128)
    || new Set(body.catalogos).size !== body.catalogos.length
    || !validMonetizations(body.monetizacoes))
    return Response.json({ error: "invalid-content" }, { status: 400 });

  try {
    const [publicationResult, monetizationResult] = await Promise.all([
      readPublication(user.idToken, user.projectId, body.publicationId),
      listDocuments(user.idToken, user.projectId, `publicacao/${body.publicationId}/monetizacao`),
    ]);
    if (publicationResult.response.status === 404)
      return Response.json({ error: "content-not-found" }, { status: 404 });
    if (!publicationResult.response.ok) {
      console.error("Firestore publication read failed", publicationResult.document?.error?.status ?? publicationResult.response.status);
      return Response.json({ error: "content-read-failed" }, { status: 500 });
    }
    if (!monetizationResult.response.ok)
      return Response.json({ error: "content-read-failed" }, { status: 500 });
    const existingDocument = publicationResult.document;
    const existingFields = existingDocument?.fields ?? {};
    if (existingFields.criador?.stringValue !== user.uid)
      return Response.json({ error: "forbidden" }, { status: 403 });
    if (!existingDocument?.updateTime)
      return Response.json({ error: "content-save-failed" }, { status: 500 });

    const previousCatalogIds = existingFields.catalogos?.arrayValue?.values?.map((item) => item.stringValue ?? "") ?? [];
    const affectedCatalogIds = [...new Set([...previousCatalogIds, ...body.catalogos as string[]])];
    const catalogResults = await Promise.all(affectedCatalogIds.map((catalogId) => readCatalog(user.idToken, user.projectId, catalogId)));
    const catalogWrites: unknown[] = [];
    for (let index = 0; index < affectedCatalogIds.length; index += 1) {
      const catalogId = affectedCatalogIds[index];
      const result = catalogResults[index];
      const shouldContain = (body.catalogos as string[]).includes(catalogId);
      if (result.response.status === 404) {
        if (shouldContain) return Response.json({ error: "catalog-not-found" }, { status: 400 });
        continue;
      }
      if (!result.response.ok) return Response.json({ error: "catalog-read-failed" }, { status: 500 });
      const document = result.document;
      const fields = document?.fields ?? {};
      if (fields.criador?.stringValue !== user.uid)
        return Response.json({ error: "forbidden-catalog" }, { status: 403 });
      if (!document?.updateTime) return Response.json({ error: "catalog-read-failed" }, { status: 500 });

      const oldPublicationIds = fields.publicacoes?.arrayValue?.values?.map((item) => item.stringValue ?? "") ?? [];
      const hadPublication = oldPublicationIds.includes(body.publicationId);
      if (hadPublication === shouldContain) continue;
      const publicationIds = shouldContain
        ? [...oldPublicationIds, body.publicationId]
        : oldPublicationIds.filter((id) => id !== body.publicationId);
      let thumbnail = fields.miniatura?.stringValue || emptyCatalogThumbnail;
      if (shouldContain && oldPublicationIds.length === 0)
        thumbnail = body.miniatura || emptyCatalogThumbnail;
      if (!shouldContain && oldPublicationIds[0] === body.publicationId) {
        const nextFirst = publicationIds[0]
          ? await readPublication(user.idToken, user.projectId, publicationIds[0])
          : null;
        if (nextFirst && !nextFirst.response.ok && nextFirst.response.status !== 404)
          return Response.json({ error: "content-read-failed" }, { status: 500 });
        thumbnail = nextFirst?.document?.fields?.miniatura?.stringValue || emptyCatalogThumbnail;
      }
      catalogWrites.push({
        update: {
          name: `projects/${user.projectId}/databases/(default)/documents/catalogo/${catalogId}`,
          fields: firestoreFields({ publicacoes: publicationIds, miniatura: thumbnail }),
        },
        updateMask: { fieldPaths: ["publicacoes", "miniatura"] },
        currentDocument: { updateTime: document.updateTime },
      });
    }

    const existingMonetizations = new Map(monetizationResult.documents.map((document) => [document.name.split("/").pop() ?? "", document]));
    const writes: unknown[] = [{
      update: {
        name: `projects/${user.projectId}/databases/(default)/documents/publicacao/${body.publicationId}`,
        fields: firestoreFields({
          titulo: body.titulo.trim(),
          descricao: body.descricao.trim(),
          tipo: body.tipo,
          tamanho: body.tamanho,
          duracao: body.duracao,
          arquivo: body.arquivo as string,
          miniatura: body.miniatura as string,
          catalogos: body.catalogos as string[],
        }),
      },
      updateMask: { fieldPaths: ["titulo", "descricao", "tipo", "tamanho", "duracao", "arquivo", "miniatura", "catalogos"] },
      currentDocument: { updateTime: existingDocument.updateTime },
    }, ...catalogWrites];

    for (const monetization of body.monetizacoes) {
      const documentName = `projects/${user.projectId}/databases/(default)/documents/publicacao/${body.publicationId}/monetizacao/${monetization.tipo}`;
      writes.push({
        update: {
          name: documentName,
          fields: firestoreFields({ tipo: monetization.tipo, preco: monetization.preco, moeda: "BRL", ativo: true }),
        },
        ...(existingMonetizations.has(monetization.tipo) ? {} : { currentDocument: { exists: false } }),
      });
    }
    for (const [type, document] of existingMonetizations) {
      if (!(body.monetizacoes as MonetizationRequest[]).some((item) => item.tipo === type))
        writes.push({ delete: document.name, currentDocument: { exists: true } });
    }

    const result = await writeFirestore(user.idToken, user.projectId, writes);
    if (!result.response.ok) {
      console.error("Firestore publication update failed", result.error?.status ?? result.response.status);
      return Response.json({ error: result.response.status === 403 ? "forbidden" : "content-save-failed" }, {
        status: result.response.status === 403 ? 403 : 500,
      });
    }
  } catch {
    return Response.json({ error: "firebase-unavailable" }, { status: 503 });
  }

  return Response.json({ publicationId: body.publicationId, updated: true });
}

export async function DELETE(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });
  const { user } = authentication;
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.publicationId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.publicationId))
    return Response.json({ error: "invalid-content" }, { status: 400 });

  try {
    const [publicationResult, monetizationResult] = await Promise.all([
      readPublication(user.idToken, user.projectId, body.publicationId),
      listDocuments(user.idToken, user.projectId, `publicacao/${body.publicationId}/monetizacao`),
    ]);
    if (publicationResult.response.status === 404)
      return Response.json({ error: "content-not-found" }, { status: 404 });
    if (!publicationResult.response.ok) return Response.json({ error: "content-read-failed" }, { status: 500 });
    if (!monetizationResult.response.ok) return Response.json({ error: "content-read-failed" }, { status: 500 });

    const publication = publicationResult.document;
    const fields = publication?.fields ?? {};
    if (fields.criador?.stringValue !== user.uid)
      return Response.json({ error: "forbidden" }, { status: 403 });
    if (!publication?.updateTime)
      return Response.json({ error: "content-save-failed" }, { status: 500 });

    const catalogIds = fields.catalogos?.arrayValue?.values?.map((item) => item.stringValue ?? "") ?? [];
    const catalogResults = await Promise.all(catalogIds.map((catalogId) => readCatalog(user.idToken, user.projectId, catalogId)));
    const writes: unknown[] = [];
    for (let index = 0; index < catalogIds.length; index += 1) {
      const catalogId = catalogIds[index];
      const result = catalogResults[index];
      if (result.response.status === 404) continue;
      if (!result.response.ok) return Response.json({ error: "catalog-read-failed" }, { status: 500 });
      const catalog = result.document;
      const catalogFields = catalog?.fields ?? {};
      if (catalogFields.criador?.stringValue !== user.uid)
        return Response.json({ error: "forbidden-catalog" }, { status: 403 });
      if (!catalog?.updateTime) return Response.json({ error: "catalog-save-failed" }, { status: 500 });

      const oldIds = catalogFields.publicacoes?.arrayValue?.values?.map((item) => item.stringValue ?? "") ?? [];
      if (!oldIds.includes(body.publicationId)) continue;
      const publicationIds = oldIds.filter((id) => id !== body.publicationId);
      let thumbnail = catalogFields.miniatura?.stringValue || emptyCatalogThumbnail;
      if (oldIds[0] === body.publicationId) {
        const nextFirst = publicationIds[0]
          ? await readPublication(user.idToken, user.projectId, publicationIds[0])
          : null;
        if (nextFirst && !nextFirst.response.ok && nextFirst.response.status !== 404)
          return Response.json({ error: "content-read-failed" }, { status: 500 });
        thumbnail = nextFirst?.document?.fields?.miniatura?.stringValue || emptyCatalogThumbnail;
      }
      writes.push({
        update: {
          name: `projects/${user.projectId}/databases/(default)/documents/catalogo/${catalogId}`,
          fields: firestoreFields({ publicacoes: publicationIds, miniatura: thumbnail }),
        },
        updateMask: { fieldPaths: ["publicacoes", "miniatura"] },
        currentDocument: { updateTime: catalog.updateTime },
      });
    }

    for (const monetization of monetizationResult.documents)
      writes.push({ delete: monetization.name, currentDocument: { exists: true } });
    writes.push({
      delete: `projects/${user.projectId}/databases/(default)/documents/publicacao/${body.publicationId}`,
      currentDocument: { updateTime: publication.updateTime },
    });

    const result = await writeFirestore(user.idToken, user.projectId, writes);
    if (!result.response.ok) {
      console.error("Firestore publication deletion failed", result.error?.status ?? result.response.status);
      return Response.json({ error: result.response.status === 403 ? "forbidden" : "content-delete-failed" }, {
        status: result.response.status === 403 ? 403 : 500,
      });
    }

    return Response.json({
      publicationId: body.publicationId,
      arquivo: fields.arquivo?.stringValue ?? "",
      miniatura: fields.miniatura?.stringValue ?? "",
      deleted: true,
    });
  } catch {
    return Response.json({ error: "firebase-unavailable" }, { status: 503 });
  }
}

async function readPublication(token: string, projectId: string, publicationId: string) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/publicacao/${encodeURIComponent(publicationId)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  const document = await response.json().catch(() => null) as {
    fields?: Record<string, {
      stringValue?: string;
      integerValue?: string;
      doubleValue?: number;
      arrayValue?: { values?: { stringValue?: string }[] };
    }>;
    updateTime?: string;
    error?: { status?: string };
  } | null;
  return { response, document };
}

async function listDocuments(token: string, projectId: string, path: string) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  const result = await response.json().catch(() => null) as {
    documents?: { name: string }[];
    error?: { status?: string };
  } | null;
  return { response, documents: result?.documents ?? [] };
}