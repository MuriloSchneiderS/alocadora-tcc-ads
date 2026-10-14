"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../providers";

type Transaction = {
  id: string;
  comprador: string;// UID do usuário que comprou
  vendedor: string;// UID do usuário que vendeu
  origem_tipo: string;// "catalogo" | "publicacao"
  origem_id: string;// ID do catálogo ou publicação
  tipo: string;// "aluguel" | "compra" | "assinatura" | "gratuito"
  preco: number;// preço em centavos
  status: string;// "pendente" | "aguardando_assinatura" | "pago" | "erro_checkout" | "reembolsado" | "contestado" | "contestacao_perdida"
  comprado_em: string | null;// data da compra, se houver
  expira_em: string | null;// data de expiração do acesso, se houver
  criado_em: string | null;// data de criação da transação
};

type Monetization = {
  id: string;
  origem_tipo: string;// "catalogo" | "publicacao"
  origem_id: string;// ID do catálogo ou publicação
  titulo: string;// título do catálogo ou publicação
  tipo: string;// "aluguel" | "compra" | "assinatura" | "gratuito"
  preco: number;// preço em centavos
  ativo: boolean;// se a monetização está ativa
  duracao: number;// duração em dias, se aplicável
};

type Subscription = {
  id: string;
  catalogo: string;
  status: string;
  preco: number;
  expira_em: string | null;
};

type DashboardData = {
  transacoes: Transaction[];
  monetizacoes: Monetization[];
  assinaturas: Subscription[];
};

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

function typeLabel(type: string) {
  if (type === "aluguel") return "Aluguel";
  if (type === "compra") return "Compra";
  if (type === "assinatura") return "Assinatura";
  if (type === "gratuito") return "Gratuito";
  return type;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pendente: "Aguardando pagamento",
    aguardando_assinatura: "Ativando assinatura",
    pago: "Pago",
    erro_checkout: "Checkout não concluído",
    reembolsado: "Reembolsado",
    contestado: "Em contestação",
    contestacao_perdida: "Contestação perdida",
  };
  return labels[status] ?? status;
}

export default function PaymentDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busySubscription, setBusySubscription] = useState("");
  const [message, setMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    const response = await fetch("/api/payments/dashboard", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      cache: "no-store",
    });
    const result = await response.json().catch(() => null) as DashboardData & { error?: string } | null;
    if (!response.ok || !result)
      throw new Error(result?.error === "firebase-admin-configuration"
        ? "Configure o Firebase Admin no servidor para carregar vendas e compras."
        : "Não foi possível carregar as informações de pagamentos.");
    return result;
  }, [user]);

  useEffect(() => {
    let current = true;
    void loadDashboard()
      .then((result) => {
        if (current && result) setData(result);
      })
      .catch((error: unknown) => {
        if (current)
          setMessage(error instanceof Error ? error.message : "Não foi possível carregar as informações de pagamentos.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [loadDashboard]);

  const paidTransactions = useMemo(
    () => data?.transacoes.filter((transaction) => transaction.status === "pago") ?? [],
    [data],
  );
  const totalSales = paidTransactions
    .filter((transaction) => transaction.vendedor === user?.uid)
    .reduce((total, transaction) => total + transaction.preco, 0);
  const totalPurchases = paidTransactions
    .filter((transaction) => transaction.comprador === user?.uid)
    .reduce((total, transaction) => total + transaction.preco, 0);
  const sales = data?.transacoes.filter((transaction) => transaction.vendedor === user?.uid) ?? [];
  const purchases = data?.transacoes.filter((transaction) => transaction.comprador === user?.uid) ?? [];

  async function cancelSubscription(subscriptionId: string) {
    if (!user || busySubscription) return;
    setBusySubscription(subscriptionId);
    setMessage("");
    try {
      const response = await fetch("/api/payments/subscriptions/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ subscriptionId }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok)
        throw new Error(result?.error === "firebase-admin-configuration"
          ? "Configure o Firebase Admin antes de cancelar assinaturas."
          : "Não foi possível cancelar a assinatura.");
      setData((current) => current ? {
        ...current,
        assinaturas: current.assinaturas.map((item) => item.id === subscriptionId
          ? { ...item, status: "cancelada" }
          : item),
      } : current);
      setMessage("Assinatura cancelada. O acesso permanece até o fim do período já pago.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível cancelar a assinatura.");
    } finally {
      setBusySubscription("");
    }
  }

  return (
    <section className="mt-12 space-y-8 border-t border-white/10 pt-8" aria-labelledby="payments-title">
      <div>
        <h2 id="payments-title" className="text-xl font-semibold text-white">Vendas, compras e monetização</h2>
        <p className="mt-1 text-xs text-cream/70">Os valores são vendas brutas registradas; os pagamentos ficam na conta da plataforma e não representam repasses.</p>
      </div>

      {loading && <p className="text-sm text-cream/70" role="status">Carregando pagamentos...</p>}
      {message && <p className="text-sm text-cream/80" role="status">{message}</p>}

      {data && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="bg-panel-muted p-4">
            <p className="text-xs uppercase text-cream/70">Vendas confirmadas</p>
            <p className="mt-1 text-2xl text-white">{money(totalSales)}</p>
          </div>
          <div className="bg-panel-muted p-4">
            <p className="text-xs uppercase text-cream/70">Compras confirmadas</p>
            <p className="mt-1 text-2xl text-white">{money(totalPurchases)}</p>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-white">Minhas monetizações</h3>
          {data.monetizacoes.length === 0
            ? <p className="text-xs text-cream/70">Você ainda não tem opções de monetização.</p>
            : <div className="divide-y divide-white/10 border-y border-white/10">
              {data.monetizacoes.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="text-white">{item.titulo}</p>
                  <p className="text-xs text-cream/70">{item.origem_tipo === "catalogo" ? "Catálogo" : "Publicação"} · {typeLabel(item.tipo)} · {item.ativo ? "Ativa" : "Inativa"}</p>
                </div>
                <span>{item.tipo === "gratuito" ? "Grátis" : money(item.preco)}</span>
              </div>)}
            </div>}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-white">Assinaturas de catálogos</h3>
          {data.assinaturas.length === 0
            ? <p className="text-xs text-cream/70">Nenhuma assinatura ativa ou anterior.</p>
            : <div className="divide-y divide-white/10 border-y border-white/10">
              {data.assinaturas.map((subscription) => <div key={subscription.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="text-white">{money(subscription.preco)} / mês</p>
                  <p className="text-xs text-cream/70">{subscription.status === "cancelada" ? "Cancelada" : subscription.status} · Acesso até {dateLabel(subscription.expira_em)}</p>
                </div>
                {subscription.status !== "cancelada" && <button
                  type="button"
                  className="border border-red px-3 py-1 text-xs text-red hover:bg-red hover:text-white disabled:opacity-50"
                  disabled={Boolean(busySubscription)}
                  onClick={() => void cancelSubscription(subscription.id)}
                >
                  {busySubscription === subscription.id ? "CANCELANDO..." : "CANCELAR"}
                </button>}
              </div>)}
            </div>}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <TransactionList title="Vendas" items={sales} empty="Nenhuma venda registrada." />
          <TransactionList title="Compras" items={purchases} empty="Nenhuma compra registrada." />
        </div>
      </>}
    </section>
  );
}

function TransactionList({ title, items, empty }: { title: string; items: Transaction[]; empty: string }) {
  return <div>
    <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
    {items.length === 0
      ? <p className="text-xs text-cream/70">{empty}</p>
      : <div className="max-h-80 divide-y divide-white/10 overflow-y-auto border-y border-white/10">
        {items.map((transaction) => <div key={transaction.id} className="py-2 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-cream">{typeLabel(transaction.tipo)} · {transaction.origem_tipo === "catalogo" ? "Catálogo" : "Publicação"}</span>
            <span className="text-white">{money(transaction.preco)}</span>
          </div>
          <p className="mt-1 text-cream/65">{statusLabel(transaction.status)} · {dateLabel(transaction.comprado_em ?? transaction.criado_em)}</p>
          {transaction.expira_em && <p className="text-cream/65">Acesso até {dateLabel(transaction.expira_em)}</p>}
        </div>)}
      </div>}
  </div>;
}
