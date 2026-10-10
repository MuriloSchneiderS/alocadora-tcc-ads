import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";

export const runtime = "nodejs";

const catalogMonetizationTypes = new Set(["gratuito", "aluguel", "assinatura", "compra"]);
const emptyCatalogThumbnail = "/assets/catalogo_vazio.png";

type CatalogMonetization = {
  tipo: string;// "gratuito" | "aluguel"(7 dias) | "assinatura"(30 dias) | "compra"(permanente, permite download)
  preco: number;//centavos no firestore
  duracao?: number;//dias, apenas para aluguel e assinatura
};

///valida se o valor é um objeto (!=nulo/array)
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

//valida se o valor é um id válido (UUID v4)
function isId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

function validMonetizations(value: unknown): value is CatalogMonetization[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return false;
  const types = new Set<string>();

  return value.every((item) => {
    if (!isRecord(item) || typeof item.tipo !== "string" || !catalogMonetizationTypes.has(item.tipo)
      || typeof item.preco !== "number" || !Number.isSafeInteger(item.preco) || item.preco < 0
      || types.has(item.tipo)) return false;
    if (item.tipo === "gratuito" && item.preco !== 0) return false;
    if (item.tipo !== "gratuito" && item.preco < 1) return false;
    if (["aluguel", "assinatura"].includes(item.tipo)
      && (typeof item.duracao !== "number" || !Number.isSafeInteger(item.duracao) || item.duracao < 1)) return false;
    types.add(item.tipo);
    return true;
  });
}

//converte valores para o formato do Firestore
function firestoreValue(value: string | number | string[]) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  return { arrayValue: { values: value.map((item) => ({ stringValue: item })) } };
}
//converte um objeto de campos para o formato do Firestore
function firestoreFields(fields: Record<string, string | number | string[]>) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValue(value)]));
}

//envia uma requisição de commit para o Firestore
async function commitFirestore(token: string, projectId: string, writes: unknown[]) {
  return fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ writes }),
      cache: "no-store",
    },
  );
}
//documento firestore -> objeto
async function readDocument(token: string, projectId: string, collection: string, id: string) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  const document = await response.json().catch(() => null) as {
    fields?: Record<string, { stringValue?: string; arrayValue?: { values?: { stringValue?: string }[] } }>;
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
    documents?: { name: string; updateTime?: string }[];
    error?: { status?: string };
  } | null;
  return { response, documents: result?.documents ?? [] };
}
function firestoreError(response: Response) {
  return Response.json(
    { error: response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "catalog-save-failed" },
    { status: response.status === 401 || response.status === 403 ? response.status : 500 },
  );
}

export async function POST(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });
  const { user } = authentication;
  const body: unknown = await request.json().catch(() => null);

  //valida se o corpo da requisição é um objeto com os campos corretos
  if (!isRecord(body) || !isId(body.catalogId)
    || typeof body.titulo !== "string" || !body.titulo.trim() || body.titulo.length > 200
    || typeof body.descricao !== "string" || body.descricao.length > 5000
    || !validMonetizations(body.monetizacoes))
    return Response.json({ error: "invalid-catalog" }, { status: 400 });

  const catalogName = `projects/${user.projectId}/databases/(default)/documents/catalogo/${body.catalogId}`;
  const writes = [{
    update: {
      name: catalogName,
      fields: firestoreFields({
        titulo: body.titulo.trim(),
        descricao: body.descricao.trim(),
        miniatura: emptyCatalogThumbnail,
        criador: user.uid,
        publicacoes: [],
      }),
    },
    updateTransforms: [{ fieldPath: "data_criacao", setToServerValue: "REQUEST_TIME" }],//usa o timestamp do servidor para o campo data_criacao
    currentDocument: { exists: false },
  }, ...body.monetizacoes.map((monetization) => ({//adiciona cada monetização como subdocumento
    update: {
      name: `${catalogName}/monetizacao/${monetization.tipo}`,
      fields: {
        ...firestoreFields({ tipo: monetization.tipo, preco: monetization.preco, moeda: "BRL" }),
        ativo: { booleanValue: true },
        ...(monetization.duracao ? { duracao: { integerValue: String(monetization.duracao) } } : {}),
      },
    },
    currentDocument: { exists: false },
  }))];

  try {
    const result = await commitFirestore(user.idToken, user.projectId, writes);
    if (!result.ok) return firestoreError(result);
  } catch {
    return Response.json({ error: "firebase-unavailable" }, { status: 503 });
  }

  return Response.json({ catalogId: body.catalogId }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });
  const { user } = authentication;
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || !isId(body.catalogId)
    || (body.action !== undefined && body.action !== "add" && body.action !== "remove" && body.action !== "reorder" && body.action !== "edit"))
    return Response.json({ error: "invalid-association" }, { status: 400 });
  const action = body.action ?? "add";
  if (action === "edit") {
    if (typeof body.titulo !== "string" || !body.titulo.trim() || body.titulo.length > 200
      || typeof body.descricao !== "string" || body.descricao.length > 5000
      || !validMonetizations(body.monetizacoes))
      return Response.json({ error: "invalid-catalog" }, { status: 400 });

    try {
      const [catalogResult, monetizationResult] = await Promise.all([
        readDocument(user.idToken, user.projectId, "catalogo", body.catalogId),
        listDocuments(user.idToken, user.projectId, `catalogo/${body.catalogId}/monetizacao`),
      ]);
      if (catalogResult.response.status === 404)
        return Response.json({ error: "content-not-found" }, { status: 404 });
      if (!catalogResult.response.ok) return firestoreError(catalogResult.response);
      if (!monetizationResult.response.ok) return firestoreError(monetizationResult.response);
      if (catalogResult.document?.fields?.criador?.stringValue !== user.uid)
        return Response.json({ error: "forbidden" }, { status: 403 });
      const updateTime = catalogResult.document.updateTime;
      if (!updateTime) return Response.json({ error: "catalog-save-failed" }, { status: 500 });

      const existing = new Map(monetizationResult.documents.map((document) => [document.name.split("/").pop() ?? "", document]));
      const writes: unknown[] = [{
        update: {
          name: `projects/${user.projectId}/databases/(default)/documents/catalogo/${body.catalogId}`,
          fields: firestoreFields({ titulo: body.titulo.trim(), descricao: body.descricao.trim() }),
        },
        updateMask: { fieldPaths: ["titulo", "descricao"] },
        currentDocument: { updateTime },
      }];
      for (const monetization of body.monetizacoes) {
        const documentName = `projects/${user.projectId}/databases/(default)/documents/catalogo/${body.catalogId}/monetizacao/${monetization.tipo}`;
        const fields = {
          ...firestoreFields({ tipo: monetization.tipo, preco: monetization.preco, moeda: "BRL" }),
          ativo: { booleanValue: true },
          ...(monetization.duracao ? { duracao: { integerValue: String(monetization.duracao) } } : {}),
        };
        writes.push({
          update: { name: documentName, fields },
          ...(existing.has(monetization.tipo) ? {} : { currentDocument: { exists: false } }),
        });
      }
      for (const [type, document] of existing) {
        if (!body.monetizacoes.some((item) => item.tipo === type))
          writes.push({ delete: document.name, currentDocument: { exists: true } });
      }

      const result = await commitFirestore(user.idToken, user.projectId, writes);
      if (!result.ok) return firestoreError(result);
      return Response.json({ catalogId: body.catalogId, action: "edit" });
    } catch {
      return Response.json({ error: "firebase-unavailable" }, { status: 503 });
    }
  }
  const isReorderRequest = action === "reorder";
  if (isReorderRequest) {
    if (!Array.isArray(body.publicationIds) || body.publicationIds.length > 500
      || !body.publicationIds.every(isId) || new Set(body.publicationIds).size !== body.publicationIds.length)
      return Response.json({ error: "invalid-order" }, { status: 400 });
  } else if (!isId(body.publicationId)) {
    return Response.json({ error: "invalid-association" }, { status: 400 });
  }

  try {
    const catalogResult = await readDocument(user.idToken, user.projectId, "catalogo", body.catalogId);
    if (catalogResult.response.status === 404)
      return Response.json({ error: "content-not-found" }, { status: 404 });
    if (!catalogResult.response.ok) return firestoreError(catalogResult.response);

    const catalogFields = catalogResult.document?.fields ?? {};
    if (catalogFields.criador?.stringValue !== user.uid)
      return Response.json({ error: "forbidden" }, { status: 403 });

    const publicationIds = catalogFields.publicacoes?.arrayValue?.values?.map((item) => item.stringValue ?? "") ?? [];
    const updateTime = catalogResult.document?.updateTime;
    if (!updateTime) return Response.json({ error: "catalog-save-failed" }, { status: 500 });

    let publicationFields: Record<string, { stringValue?: string; arrayValue?: { values?: { stringValue?: string }[] } }> = {};
    let publicationUpdateTime: string | undefined;
    let updatedPublicationIds: string[];
    if (isReorderRequest) {
      const requestedIds = body.publicationIds as string[];
      if (requestedIds.length !== publicationIds.length || requestedIds.some((id) => !publicationIds.includes(id)))
        return Response.json({ error: "invalid-order" }, { status: 400 });
      updatedPublicationIds = requestedIds;
    } else {
      const publicationResult = await readDocument(user.idToken, user.projectId, "publicacao", body.publicationId as string);
      if (publicationResult.response.status === 404)
        return Response.json({ error: "content-not-found" }, { status: 404 });
      if (!publicationResult.response.ok) return firestoreError(publicationResult.response);
      publicationFields = publicationResult.document?.fields ?? {};
      if (publicationFields.criador?.stringValue !== user.uid)
        return Response.json({ error: "forbidden" }, { status: 403 });
      publicationUpdateTime = publicationResult.document?.updateTime;
      if (!publicationUpdateTime)
        return Response.json({ error: "publication-save-failed" }, { status: 500 });

      const isAlreadyIncluded = publicationIds.includes(body.publicationId as string);
      if (action === "add" && isAlreadyIncluded)
        return Response.json({ error: "already-added" }, { status: 409 });
      if (action === "remove" && !isAlreadyIncluded)
        return Response.json({ error: "not-in-catalog" }, { status: 404 });
      updatedPublicationIds = action === "add"
        ? [...publicationIds, body.publicationId as string]
        : publicationIds.filter((id) => id !== body.publicationId);
    }

    let thumbnail = catalogFields.miniatura?.stringValue || emptyCatalogThumbnail;
    if (action === "add" && publicationIds.length === 0)
      thumbnail = publicationFields.miniatura?.stringValue || emptyCatalogThumbnail;
    if (action === "remove") {
      if (updatedPublicationIds.length === 0) {
        thumbnail = emptyCatalogThumbnail;
      } else if (publicationIds[0] === body.publicationId) {
        const firstPublication = await readDocument(user.idToken, user.projectId, "publicacao", updatedPublicationIds[0]);
        if (!firstPublication.response.ok && firstPublication.response.status !== 404)
          return firestoreError(firstPublication.response);
        thumbnail = firstPublication.document?.fields?.miniatura?.stringValue || emptyCatalogThumbnail;
      }
    }
    if (isReorderRequest && updatedPublicationIds[0] !== publicationIds[0]) {
      if (updatedPublicationIds.length === 0) {
        thumbnail = emptyCatalogThumbnail;
      } else {
        const firstPublication = await readDocument(user.idToken, user.projectId, "publicacao", updatedPublicationIds[0]);
        if (!firstPublication.response.ok && firstPublication.response.status !== 404)
          return firestoreError(firstPublication.response);
        if (firstPublication.document?.fields?.criador?.stringValue !== user.uid)
          return Response.json({ error: "forbidden" }, { status: 403 });
        thumbnail = firstPublication.document?.fields?.miniatura?.stringValue || emptyCatalogThumbnail;
      }
    }
    const writes: unknown[] = [{
      update: {
        name: `projects/${user.projectId}/databases/(default)/documents/catalogo/${body.catalogId}`,
        fields: firestoreFields({ publicacoes: updatedPublicationIds, miniatura: thumbnail }),
      },
      updateMask: { fieldPaths: ["publicacoes", "miniatura"] },
      currentDocument: { updateTime },
    }];
    if (!isReorderRequest) {
      const publicationCatalogIds = publicationFields.catalogos?.arrayValue?.values?.map((item) => item.stringValue ?? "") ?? [];
      const updatedCatalogIds = action === "add"
        ? [...new Set([...publicationCatalogIds, body.catalogId])]
        : publicationCatalogIds.filter((id) => id !== body.catalogId);
      writes.push({
        update: {
          name: `projects/${user.projectId}/databases/(default)/documents/publicacao/${body.publicationId}`,
          fields: firestoreFields({ catalogos: updatedCatalogIds }),
        },
        updateMask: { fieldPaths: ["catalogos"] },
        currentDocument: { updateTime: publicationUpdateTime },
      });
    }
    const result = await commitFirestore(user.idToken, user.projectId, writes);
    if (!result.ok) return firestoreError(result);
  } catch {
    return Response.json({ error: "firebase-unavailable" }, { status: 503 });
  }

  return Response.json({
    catalogId: body.catalogId,
    ...(typeof body.publicationId === "string" ? { publicationId: body.publicationId } : {}),
    ...(isReorderRequest ? { publicationIds: body.publicationIds } : {}),
    action,
  });
}

export async function DELETE(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });
  const { user } = authentication;
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || !isId(body.catalogId))
    return Response.json({ error: "invalid-catalog" }, { status: 400 });

  try {
    const [catalogResult, monetizationResult] = await Promise.all([
      readDocument(user.idToken, user.projectId, "catalogo", body.catalogId),
      listDocuments(user.idToken, user.projectId, `catalogo/${body.catalogId}/monetizacao`),
    ]);
    if (catalogResult.response.status === 404)
      return Response.json({ error: "content-not-found" }, { status: 404 });
    if (!catalogResult.response.ok) return firestoreError(catalogResult.response);
    if (!monetizationResult.response.ok) return firestoreError(monetizationResult.response);

    const catalogDocument = catalogResult.document;
    const catalogFields = catalogDocument?.fields ?? {};
    if (catalogFields.criador?.stringValue !== user.uid)
      return Response.json({ error: "forbidden" }, { status: 403 });
    if (!catalogDocument?.updateTime)
      return Response.json({ error: "catalog-save-failed" }, { status: 500 });

    const publicationIds = catalogFields.publicacoes?.arrayValue?.values?.map((item) => item.stringValue ?? "") ?? [];
    const publicationResults = await Promise.all(publicationIds.map((publicationId) =>
      readDocument(user.idToken, user.projectId, "publicacao", publicationId)));
    const writes: unknown[] = [];
    for (let index = 0; index < publicationResults.length; index += 1) {
      const result = publicationResults[index];
      if (result.response.status === 404) continue;
      if (!result.response.ok) return firestoreError(result.response);
      const document = result.document;
      const fields = document?.fields ?? {};
      if (fields.criador?.stringValue !== user.uid)
        return Response.json({ error: "forbidden" }, { status: 403 });
      if (!document?.updateTime)
        return Response.json({ error: "publication-save-failed" }, { status: 500 });
      const catalogIds = fields.catalogos?.arrayValue?.values?.map((item) => item.stringValue ?? "") ?? [];
      writes.push({
        update: {
          name: `projects/${user.projectId}/databases/(default)/documents/publicacao/${publicationIds[index]}`,
          fields: firestoreFields({ catalogos: catalogIds.filter((id) => id !== body.catalogId) }),
        },
        updateMask: { fieldPaths: ["catalogos"] },
        currentDocument: { updateTime: document.updateTime },
      });
    }

    for (const monetization of monetizationResult.documents)
      writes.push({ delete: monetization.name, currentDocument: { exists: true } });
    writes.push({
      delete: `projects/${user.projectId}/databases/(default)/documents/catalogo/${body.catalogId}`,
      currentDocument: { updateTime: catalogDocument.updateTime },
    });
    const result = await commitFirestore(user.idToken, user.projectId, writes);
    if (!result.ok) return firestoreError(result);
  } catch {
    return Response.json({ error: "firebase-unavailable" }, { status: 503 });
  }

  return Response.json({ catalogId: body.catalogId, deleted: true });
}