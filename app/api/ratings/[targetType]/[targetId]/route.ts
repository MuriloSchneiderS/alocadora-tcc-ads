import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

type TargetType = "publication" | "catalog";
type RouteContext = { params: Promise<{ targetType: string; targetId: string }> };

//determinar coleção e campo alvo com base no tipo
function targetCollection(targetType: TargetType) {
  return targetType === "publication" ? "publicacao" : "catalogo";
}
function targetField(targetType: TargetType) {
  return targetType === "publication" ? "publicacao" : "catalogo";
}
function isValidTarget(targetType: string, targetId: string): targetType is TargetType {
  return (targetType === "publication" || targetType === "catalog")
    && targetId.length > 0 && targetId.length <= 1500 && !targetId.includes("/");
}
function ratingDocumentId(targetType: TargetType, targetId: string, userId: string) {
  const identity = targetType === "publication" ? [targetId, userId] : [targetType, targetId, userId];
  return Buffer.from(JSON.stringify(identity)).toString("base64url");
}

//converte formato de tempo do Firestore para milissegundos
function timestampMillis(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function")
    return value.toMillis();
  return 0;
}

//retorna a média, contagem e comentários de avaliações para um alvo específico, pode filtrando por usuário autenticado
export async function GET(request: Request, { params }: RouteContext) {
  const { targetType, targetId } = await params;
  if (!isValidTarget(targetType, targetId))
    return Response.json({ error: "invalid-rating-target" }, { status: 400 });

  let userId: string | null = null;
  let projectId: string | undefined;
  if (request.headers.has("authorization")) {
    const authentication = await authenticateFirebaseRequest(request);
    if (!authentication.ok)
      return Response.json({ error: authentication.error }, { status: authentication.status });
    userId = authentication.user.uid;
    projectId = authentication.user.projectId;
  }

  try {
    const database = getAdminFirestore(projectId);
    const targetRef = database.collection(targetCollection(targetType)).doc(targetId);
    const ratingsQuery = database.collection("avaliacao").where(targetField(targetType), "==", targetId);
    const [targetSnapshot, ratingsSnapshot] = await Promise.all([targetRef.get(), ratingsQuery.get()]);
    if (!targetSnapshot.exists)
      return Response.json({ error: "rating-target-not-found" }, { status: 404 });

    const validRatings = ratingsSnapshot.docs.filter((item) => {
      const rating = item.get("nota");
      return typeof rating === "number" && rating >= 1 && rating <= 5;
    });
    const total = validRatings.reduce((sum, item) => sum + Number(item.get("nota")), 0);
    const averageValue = targetSnapshot.get("avaliacao");
    const average = typeof averageValue === "number" && Number.isFinite(averageValue)
      ? averageValue
      : validRatings.length > 0 ? Math.round((total / validRatings.length) * 10) / 10 : 0;
    const sortedRatings = validRatings.sort((first, second) =>
      timestampMillis(second.get("data_criacao")) - timestampMillis(first.get("data_criacao")),
    );
    const recentRatings = sortedRatings.slice(0, 20);
    const profiles = new Map<string, Record<string, unknown>>();
    await Promise.all([...new Set(recentRatings.map((item) => String(item.get("usuario") ?? "")))]
      .filter(Boolean)
      .map(async (id) => {
        const profile = await database.collection("usuario").doc(id).get();
        if (profile.exists) profiles.set(id, profile.data() ?? {});
      }));

    const reviews = recentRatings.map((item) => {
      const authorId = String(item.get("usuario") ?? "");
      const profile = profiles.get(authorId);
      const createdAt = timestampMillis(item.get("data_criacao"));
      return {
        id: item.id,
        author: String(profile?.nome ?? "Usuário"),
        rating: Number(item.get("nota")),
        comment: String(item.get("comentario") ?? ""),
        createdAt: createdAt ? new Date(createdAt).toISOString() : "",
      };
    });
    const userRatingId = userId ? ratingDocumentId(targetType, targetId, userId) : "";
    const userRating = userRatingId ? ratingsSnapshot.docs.find((item) => item.id === userRatingId) : undefined;

    return Response.json({
      average,
      count: validRatings.length,
      reviews,
      userReview: userRating ? {
        rating: Number(userRating.get("nota") ?? 0),
        comment: String(userRating.get("comentario") ?? ""),
      } : null,
    });
  } catch (error) {
    console.error("Rating lookup failed", {
      targetType,
      targetId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({ error: "ratings-unavailable" }, { status: 503 });
  }
}

//submete uma avaliação para um alvo específico, requer autenticação do usuário
export async function POST(request: Request, { params }: RouteContext) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });

  const { targetType, targetId } = await params;
  if (!isValidTarget(targetType, targetId))
    return Response.json({ error: "invalid-rating-target" }, { status: 400 });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || !("rating" in body) || typeof body.rating !== "number"
    || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5
    || !("comment" in body) || typeof body.comment !== "string"
    || body.comment.trim().length === 0 || body.comment.trim().length > 1000)
    return Response.json({ error: "invalid-rating" }, { status: 400 });
  const rating = body.rating as number;
  const comment = body.comment.trim();

  try {
    const database = getAdminFirestore(authentication.user.projectId);
    const targetRef = database.collection(targetCollection(targetType)).doc(targetId);
    const ratingRef = database.collection("avaliacao").doc(
      ratingDocumentId(targetType, targetId, authentication.user.uid),
    );
    const result = await database.runTransaction(async (transaction) => {
      const targetSnapshot = await transaction.get(targetRef);
      if (!targetSnapshot.exists)
        throw new Error("rating-target-not-found");

      const [previousRatingSnapshot, ratingsSnapshot] = await Promise.all([
        transaction.get(ratingRef),
        transaction.get(database.collection("avaliacao").where(targetField(targetType), "==", targetId)),
      ]);
      let total = 0;
      let count = 0;
      for (const ratingDocument of ratingsSnapshot.docs) {
        if (ratingDocument.id === ratingRef.id) continue;
        const existingRating = ratingDocument.get("nota");
        if (typeof existingRating === "number" && existingRating >= 1 && existingRating <= 5) {
          total += existingRating;
          count += 1;
        }
      }

      total += rating;
      count += 1;
      const average = Math.round((total / count) * 10) / 10;
      transaction.set(ratingRef, {
        usuario: authentication.user.uid,
        [targetField(targetType)]: targetId,
        nota: rating,
        comentario: comment,
        data_criacao: previousRatingSnapshot.get("data_criacao") ?? FieldValue.serverTimestamp(),
      });
      transaction.update(targetRef, { avaliacao: average });
      return { average, count, rating, comment };
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "rating-target-not-found")
      return Response.json({ error: error.message }, { status: 404 });
    console.error("Rating submission failed", {
      targetType,
      targetId,
      userId: authentication.user.uid,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({ error: "rating-submission-failed" }, { status: 503 });
  }
}