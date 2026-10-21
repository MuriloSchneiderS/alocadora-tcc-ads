"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../providers";

type Recipient = {
  titular: string;
  cpf: string;
  banco: string;
  agencia: string;
  conta: string;
  tipo_conta: "corrente" | "poupanca";
  pix_tipo: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";
  pix_chave: string;
};

const emptyRecipient: Recipient = {
  titular: "",
  cpf: "",
  banco: "",
  agencia: "",
  conta: "",
  tipo_conta: "corrente",
  pix_tipo: "cpf",
  pix_chave: "",
};

const fakeRecipient: Recipient = {
  titular: "Criador de Teste",
  cpf: "12345678909",
  banco: "Banco de teste (000)",
  agencia: "0001",
  conta: "12345-6",
  tipo_conta: "corrente",
  pix_tipo: "email",
  pix_chave: "criador.teste@example.invalid",
};

export default function RecipientSettings() {
  const { user } = useAuth();
  const [recipient, setRecipient] = useState<Recipient>(emptyRecipient);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/payments/recipient", {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          cache: "no-store",
        });
        const result = await response.json() as { recipient?: Recipient | null; pronto?: boolean };
        if (!response.ok) throw new Error();
        if (active) {
          setRecipient(result.recipient ?? emptyRecipient);
          setConfigured(result.pronto === true);
        }
      } catch {
        if (active) setMessage("Não foi possível carregar os dados de recebimento.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user]);

  function update<K extends keyof Recipient>(key: K, value: Recipient[K]) {
    setRecipient((current) => ({ ...current, [key]: value }));
  }

  async function saveRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/payments/recipient", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify(recipient),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok)
        throw new Error(result?.error === "invalid-recipient"
          ? "Confira CPF, chave PIX e dados bancários informados."
          : "Não foi possível salvar os dados de recebimento.");
      setConfigured(true);
      setMessage("Dados de recebimento salvos.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar os dados de recebimento.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="mt-10 border-t border-white/10 pt-8" aria-labelledby="recipient-title">
    <div className="mb-4">
      <h2 id="recipient-title" className="text-xl font-semibold text-white">Dados para receber vendas</h2>
      <p className="mt-1 text-xs text-cream/70">Cadastro obrigatório para criar publicações. Dados privados, usados apenas para o controle de repasses de teste.</p>
    </div>
    {loading ? <p role="status" className="text-sm text-cream/70">Carregando dados de recebimento...</p> : <form onSubmit={saveRecipient} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-cream/80">Nome do titular
          <input required maxLength={100} value={recipient.titular} onChange={(event) => update("titular", event.target.value)} className="mt-1 w-full border border-white/20 bg-ink px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-cream/80">CPF do titular
          <input required inputMode="numeric" maxLength={14} value={recipient.cpf} onChange={(event) => update("cpf", event.target.value)} className="mt-1 w-full border border-white/20 bg-ink px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-cream/80">Banco
          <input required maxLength={80} value={recipient.banco} onChange={(event) => update("banco", event.target.value)} className="mt-1 w-full border border-white/20 bg-ink px-3 py-2 text-sm text-white" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-cream/80">Agência
            <input required maxLength={20} value={recipient.agencia} onChange={(event) => update("agencia", event.target.value)} className="mt-1 w-full border border-white/20 bg-ink px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-xs text-cream/80">Conta
            <input required maxLength={30} value={recipient.conta} onChange={(event) => update("conta", event.target.value)} className="mt-1 w-full border border-white/20 bg-ink px-3 py-2 text-sm text-white" />
          </label>
        </div>
        <label className="text-xs text-cream/80">Tipo de conta
          <select value={recipient.tipo_conta} onChange={(event) => update("tipo_conta", event.target.value as Recipient["tipo_conta"])} className="mt-1 w-full border border-white/20 bg-ink px-3 py-2 text-sm text-white">
            <option value="corrente">Corrente</option>
            <option value="poupanca">Poupança</option>
          </select>
        </label>
        <label className="text-xs text-cream/80">Tipo da chave PIX
          <select value={recipient.pix_tipo} onChange={(event) => update("pix_tipo", event.target.value as Recipient["pix_tipo"])} className="mt-1 w-full border border-white/20 bg-ink px-3 py-2 text-sm text-white">
            <option value="cpf">CPF</option>
            <option value="cnpj">CNPJ</option>
            <option value="email">E-mail</option>
            <option value="telefone">Telefone</option>
            <option value="aleatoria">Aleatória</option>
          </select>
        </label>
        <label className="text-xs text-cream/80 sm:col-span-2">Chave PIX
          <input required maxLength={120} value={recipient.pix_chave} onChange={(event) => update("pix_chave", event.target.value)} className="mt-1 w-full border border-white/20 bg-ink px-3 py-2 text-sm text-white" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => { setRecipient(fakeRecipient); setMessage("Dados fictícios preenchidos. Salve para ativar o cadastro de teste."); }} className="border border-white/25 px-4 py-2 text-xs font-bold hover:border-gold hover:text-gold">PREENCHER DADOS FICTÍCIOS</button>
        <button type="submit" disabled={saving} className="bg-ink px-6 py-2 text-xs font-bold hover:bg-gold hover:text-navy disabled:opacity-60">{saving ? "SALVANDO..." : "SALVAR DADOS"}</button>
        <p role="status" className="text-xs text-cream/75">{message || (configured ? "Cadastro de recebimento ativo." : "Cadastro pendente.")}</p>
      </div>
    </form>}
  </section>;
}