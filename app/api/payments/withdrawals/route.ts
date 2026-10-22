import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";
import { getAdminFirestore } from "@/lib/firebase-admin";

export const runtime = "nodejs";

//criador recebe 90% do valor da venda, plataforma recebe 10% de taxa
function creatorAmount(transaction: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = transaction.data();
  if (Number.isSafeInteger(data.valor_criador)) return Number(data.valor_criador);
  const gross = Number(data.preco ?? 0);
  return gross - Math.round(gross * 0.1);
}
//
function withdrawalView(snapshot: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = snapshot.data();
  const createdAt = data.criado_em && typeof data.criado_em.toDate === "function"
    ? data.criado_em.toDate().toISOString()
    : null;
  return {
    id: snapshot.id,
    valor: Number(data.valor ?? 0),
    status: String(data.status ?? "simulado"),
    criado_em: createdAt,
    email: String(data.email ?? ""),
  };
}

//retorna os documentos de saques do usuário, saldo disponível e se os dados de recebimento estão configurados
export async function GET(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });

  try {
    const database = getAdminFirestore(authentication.user.projectId);
    const userId = authentication.user.uid;
    const [sales, withdrawals, recipient] = await Promise.all([
      database.collection("transacao").where("vendedor", "==", userId).get(),//vendas realizadas, com status "pago" quando o comprador finaliza a compra
      database.collection("saque").where("vendedor", "==", userId).get(),//saques realizados, com status "simulado" quando o criador solicita o saque
      database.collection("dados_recebimento").doc(userId).get(),//dados do recebimento do valor da venda (titular, banco, agencia, conta, tipo_conta, pix_tipo, pix_chave) são armazenados no firestore na coleção dados_recebimento, separada do usuário por segurança, ja que usuário é um documento público.
    ]);
    const earned = sales.docs
      .filter((sale) => sale.data().status === "pago")
      .reduce((total, sale) => total + creatorAmount(sale), 0);
    const paidOut = withdrawals.docs
      .filter((withdrawal) => withdrawal.data().status === "simulado")
      .reduce((total, withdrawal) => total + Number(withdrawal.data().valor ?? 0), 0);

    return Response.json({
      saldo_disponivel: Math.max(0, earned - paidOut),//tira do saldo disponível o valor dos saques realizados, que ainda não foram pagos ao criador
      dados_recebimento_configurados: recipient.data()?.pronto === true,
      saques: withdrawals.docs.map(withdrawalView)
        .sort((first, second) => (second.criado_em ?? "").localeCompare(first.criado_em ?? ""))
        .slice(0, 20),//organiza os saques do usuário em ordem decrescente de data de criação, e limita a 20 saques
    });
  } catch (error) {
    console.error("Withdrawal dashboard load failed", error);
    return Response.json({ error: "withdrawal-dashboard-failed" }, { status: 503 });
  }
}

//salva as informações do saque solicitado pelo criador, e retorna o comprovante do saque, saldo disponível atualizado e se o email de confirmação foi enviado
export async function POST(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });

  const body: unknown = await request.json().catch(() => null);
  const amount = typeof body === "object" && body !== null && "valor" in body
    ? (body as { valor?: unknown }).valor
    : null;
  if (!Number.isSafeInteger(amount) || Number(amount) < 100)
    return Response.json({ error: "invalid-withdrawal-amount" }, { status: 400 });

  try {
    const database = getAdminFirestore(authentication.user.projectId);
    const userId = authentication.user.uid;
    const recipientRef = database.collection("dados_recebimento").doc(userId);
    const salesQuery = database.collection("transacao").where("vendedor", "==", userId);
    const withdrawalsQuery = database.collection("saque").where("vendedor", "==", userId);
    const withdrawalRef = database.collection("saque").doc(randomUUID());
    const now = new Date();
    const result = await database.runTransaction(async (transaction) => {
      const [recipient, sales, withdrawals] = await Promise.all([
        transaction.get(recipientRef),
        transaction.get(salesQuery),
        transaction.get(withdrawalsQuery),
      ]);
      const recipientData = recipient.data();
      if (!recipient.exists || recipientData?.pronto !== true)
        throw new Error("payout-profile-required");

      const earned = sales.docs
        .filter((sale) => sale.data().status === "pago")
        .reduce((total, sale) => total + creatorAmount(sale), 0);
      const paidOut = withdrawals.docs
        .filter((withdrawal) => withdrawal.data().status === "simulado")
        .reduce((total, withdrawal) => total + Number(withdrawal.data().valor ?? 0), 0);
      const available = Math.max(0, earned - paidOut);
      if (Number(amount) > available)
        throw new Error("insufficient-withdrawable-balance");

      transaction.create(withdrawalRef, {
        vendedor: userId,
        valor: Number(amount),
        moeda: "BRL",
        status: "simulado",
        email: authentication.user.email ?? "",
        destinatario: recipientData,
        criado_em: FieldValue.serverTimestamp(),
      });
      return available - Number(amount);
    });

    return Response.json({
      comprovante: {
        id: withdrawalRef.id,
        valor: Number(amount),
        criado_em: now.toISOString(),
        email: authentication.user.email,
        status: "simulado",
      },
      saldo_disponivel: result,
      email_enviado: false,
    }, { status: 201 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "payout-profile-required")
      return Response.json({ error: reason }, { status: 409 });
    if (reason === "insufficient-withdrawable-balance")
      return Response.json({ error: reason }, { status: 409 });
    console.error("Simulated withdrawal failed", error);
    return Response.json({ error: "withdrawal-failed" }, { status: 503 });
  }
}