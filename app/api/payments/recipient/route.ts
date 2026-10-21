import { authenticateFirebaseRequest } from "@/lib/firebase-auth-server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

const pixTypes = new Set(["cpf", "cnpj", "email", "telefone", "aleatoria"]);
const accountTypes = new Set(["corrente", "poupanca"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidRecipient(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  const { titular, cpf, banco, agencia, conta, tipo_conta, pix_tipo, pix_chave } = value;
  if (typeof titular !== "string" || titular.trim().length < 3 || titular.length > 100
    || typeof cpf !== "string" || !/^\d{11}$/.test(cpf.replace(/\D/g, ""))
    || typeof banco !== "string" || !banco.trim() || banco.length > 80
    || typeof agencia !== "string" || !/^[\w.-]{1,20}$/.test(agencia.trim())
    || typeof conta !== "string" || !/^[\w.-]{1,30}$/.test(conta.trim())
    || typeof tipo_conta !== "string" || !accountTypes.has(tipo_conta)
    || typeof pix_tipo !== "string" || !pixTypes.has(pix_tipo)
    || typeof pix_chave !== "string" || !pix_chave.trim() || pix_chave.length > 120)
    return false;

  const digits = pix_chave.replace(/\D/g, "");
  if (pix_tipo === "cpf" && !/^\d{11}$/.test(digits)) return false;
  if (pix_tipo === "cnpj" && !/^\d{14}$/.test(digits)) return false;
  if (pix_tipo === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pix_chave)) return false;
  if (pix_tipo === "telefone" && !/^\+?\d{10,13}$/.test(pix_chave.replace(/[\s()-]/g, ""))) return false;
  if (pix_tipo === "aleatoria" && !/^[0-9a-f-]{32,36}$/i.test(pix_chave)) return false;
  return true;
}

//dados do recebimento do valor da venda (titular, banco, agencia, conta, tipo_conta, pix_tipo, pix_chave) são armazenados no firestore na coleção dados_recebimento, 
//separada do usuário por segurança, ja que usuário é um documento público.
export async function GET(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });

  try {
    const snapshot = await getAdminFirestore(authentication.user.projectId)
      .collection("dados_recebimento").doc(authentication.user.uid).get();
    const data = snapshot.data();
    return Response.json({
      recipient: data ? {
        titular: String(data.titular ?? ""),
        cpf: String(data.cpf ?? ""),
        banco: String(data.banco ?? ""),
        agencia: String(data.agencia ?? ""),
        conta: String(data.conta ?? ""),
        tipo_conta: String(data.tipo_conta ?? "corrente"),
        pix_tipo: String(data.pix_tipo ?? "cpf"),
        pix_chave: String(data.pix_chave ?? ""),
      } : null,
      pronto: data?.pronto === true,
    });
  } catch (error) {
    console.error("Payout recipient load failed", error);
    return Response.json({ error: "payout-profile-unavailable" }, { status: 503 });
  }
}

//armazena os dados do recebimento do valor da venda (titular, banco, agencia, conta, tipo_conta, pix_tipo, pix_chave) no firestore
export async function PUT(request: Request) {
  const authentication = await authenticateFirebaseRequest(request);
  if (!authentication.ok)
    return Response.json({ error: authentication.error }, { status: authentication.status });

  const body: unknown = await request.json().catch(() => null);
  if (!isValidRecipient(body))
    return Response.json({ error: "invalid-recipient" }, { status: 400 });

  try {
    await getAdminFirestore(authentication.user.projectId)
      .collection("dados_recebimento").doc(authentication.user.uid).set({
        titular: body.titular.trim(),
        cpf: body.cpf.replace(/\D/g, ""),
        banco: body.banco.trim(),
        agencia: body.agencia.trim(),
        conta: body.conta.trim(),
        tipo_conta: body.tipo_conta,
        pix_tipo: body.pix_tipo,
        pix_chave: body.pix_chave.trim(),
        pronto: true,
        atualizado_em: FieldValue.serverTimestamp(),
      }, { merge: true });
    return Response.json({ pronto: true });
  } catch (error) {
    console.error("Payout recipient save failed", error);
    return Response.json({ error: "payout-profile-unavailable" }, { status: 503 });
  }
}