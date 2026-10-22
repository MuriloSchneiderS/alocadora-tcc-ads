import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";
import { getAdminFirestore } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function isoDate(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function")
    return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function transactionView(snapshot: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = snapshot.data();
  const price = Number(data.preco ?? 0);
  const platformFee = Number(data.taxa_plataforma ?? Math.round(price * 0.1));//split 90/10, taxa da plataforma de 10%
  return {
    id: snapshot.id,
    comprador: String(data.comprador ?? ""),
    vendedor: String(data.vendedor ?? ""),
    origem_tipo: String(data.origem_tipo ?? ""),
    origem_id: String(data.origem_id ?? ""),
    tipo: String(data.tipo ?? ""),
    preco: price,
    taxa_plataforma: platformFee,
    valor_criador: Number(data.valor_criador ?? price - platformFee),
    status: String(data.status ?? "pendente"),
    comprado_em: isoDate(data.comprado_em),
    expira_em: isoDate(data.expira_em),
    criado_em: isoDate(data.criado_em),
  };
}

export async function GET(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });

  try {
    const database = getAdminFirestore(authentication.user.projectId);
    const userId = authentication.user.uid;
    const [purchases, sales, subscriptions, publications, catalogs] = await Promise.all([
      database.collection("transacao").where("comprador", "==", userId).limit(100).get(),
      database.collection("transacao").where("vendedor", "==", userId).limit(100).get(),
      database.collection("assinatura").where("usuario", "==", userId).limit(100).get(),
      database.collection("publicacao").where("criador", "==", userId).limit(100).get(),
      database.collection("catalogo").where("criador", "==", userId).limit(100).get(),
    ]);

    const transactions = new Map<string, ReturnType<typeof transactionView>>();
    for (const snapshot of [...purchases.docs, ...sales.docs])
      transactions.set(snapshot.id, transactionView(snapshot));

    const monetizations = await Promise.all([
      ...publications.docs.map(async (publication) => {
        const options = await publication.ref.collection("monetizacao").get();
        return options.docs.map((option) => ({
          id: `${publication.id}:${option.id}`,
          origem_tipo: "publicacao",
          origem_id: publication.id,
          titulo: String(publication.data().titulo ?? "Publicação"),
          tipo: String(option.data().tipo ?? option.id),
          preco: Number(option.data().preco ?? 0),
          ativo: option.data().ativo === true,
          duracao: Number(option.data().duracao ?? (option.id === "aluguel" ? 7 : 0)),
        }));
      }),
      ...catalogs.docs.map(async (catalog) => {
        const options = await catalog.ref.collection("monetizacao").get();
        return options.docs.map((option) => ({
          id: `${catalog.id}:${option.id}`,
          origem_tipo: "catalogo",
          origem_id: catalog.id,
          titulo: String(catalog.data().titulo ?? "Catálogo"),
          tipo: String(option.data().tipo ?? option.id),
          preco: Number(option.data().preco ?? 0),
          ativo: option.data().ativo === true,
          duracao: Number(option.data().duracao ?? 0),
        }));
      }),
    ]);

    const subscriptionViews = subscriptions.docs.map((snapshot) => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        catalogo: String(data.catalogo ?? ""),
        status: String(data.status ?? ""),
        preco: Number(data.preco ?? 0),
        expira_em: isoDate(data.expira_em),
      };
    });
    return Response.json({
      transacoes: [...transactions.values()].sort((first, second) =>
        (second.comprado_em ?? second.criado_em ?? "").localeCompare(first.comprado_em ?? first.criado_em ?? "")),
      monetizacoes: monetizations.flat(),
      assinaturas: subscriptionViews,
    });
  } catch (error) {
    console.error("Payment dashboard load failed", error);
    return Response.json({
      error: error instanceof Error && /firebase-admin-/.test(error.message)
        ? "firebase-admin-configuration"
        : "payment-dashboard-failed",
    }, { status: 503 });
  }
}
