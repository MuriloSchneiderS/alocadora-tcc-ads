'use client';

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import Header from "../components/Header";
import { useAuth } from "../providers";

type MonetizationKey = "gratuito" | "semanal" | "mensal" | "compra";

const monetizationOptions: { key: MonetizationKey; label: string; duration?: number; type: string }[] = [
	{ key: "gratuito", label: "Gratuito", type: "gratuito" },
	{ key: "semanal", label: "Assinatura semanal", duration: 7, type: "aluguel" },
	{ key: "mensal", label: "Assinatura mensal", duration: 30, type: "assinatura" },
	{ key: "compra", label: "Compra avulsa", type: "compra" },
];

export default function PublicacaoCatalogo() {
	const router = useRouter();
	const { user, isLoading } = useAuth();
	const [titulo, setTitulo] = useState("");
	const [descricao, setDescricao] = useState("");
	const [selected, setSelected] = useState<Record<MonetizationKey, boolean>>({
		gratuito: true,
		semanal: false,
		mensal: false,
		compra: false,
	});
	const [prices, setPrices] = useState<Record<MonetizationKey, string>>({
		gratuito: "",
		semanal: "",
		mensal: "",
		compra: "",
	});
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState(false);

	useEffect(() => {
		if (!isLoading && !user) router.replace("/login");
	}, [isLoading, router, user]);

	async function createCatalog(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!user || saving) return;

		const chosenOptions = monetizationOptions.filter((option) => selected[option.key]);
		if (!titulo.trim()) {
			setError(true);
			setMessage("Informe o título do catálogo.");
			return;
		}
		if (chosenOptions.length === 0) {
			setError(true);
			setMessage("Selecione ao menos uma opção de monetização.");
			return;
		}
		const invalidPrice = chosenOptions.find((option) => option.key !== "gratuito"
			&& (!Number.isFinite(Number(prices[option.key])) || Number(prices[option.key]) <= 0));
		if (invalidPrice) {
			setError(true);
			setMessage(`Informe um preço maior que zero para ${invalidPrice.label.toLowerCase()}.`);
			return;
		}

		setSaving(true);
		setError(false);
		setMessage("Criando catálogo...");
		const catalogId = crypto.randomUUID();
		try {
			const response = await fetch("/api/catalogo", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${await user.getIdToken()}`,
				},
				body: JSON.stringify({
					catalogId,
					titulo: titulo.trim(),
					descricao: descricao.trim(),
					monetizacoes: chosenOptions.map((option) => ({
						tipo: option.type,
						preco: option.key === "gratuito" ? 0 : Math.round(Number(prices[option.key]) * 100),
						...(option.duration ? { duracao: option.duration } : {}),
					})),
				}),
			});
			const result = await response.json().catch(() => null) as { error?: string } | null;
			if (!response.ok) {
				if (result?.error === "unauthorized") throw new Error("Sua sessão expirou. Entre novamente.");
				if (result?.error === "firebase-configuration") throw new Error("A configuração do Firebase está incompleta.");
				if (response.status === 403) throw new Error("O Firebase negou a criação do catálogo. Verifique as regras de segurança.");
				throw new Error("Não foi possível criar o catálogo.");
			}
			router.push(`/catalogo/${catalogId}`);
		} catch (caught) {
			setError(true);
			setMessage(caught instanceof Error ? caught.message : "Não foi possível criar o catálogo.");
			setSaving(false);
		}
	}

	if (isLoading || !user) {
		return <div className="flex min-h-screen flex-col bg-ink text-cream"><Header showSearch={false} showPublish={false} /><main className="flex flex-1 items-center justify-center">Verificando sessão...</main></div>;
	}

	return (
		<div className="flex min-h-screen flex-col bg-ink text-cream">
			<Header showSearch={false} showPublish={false} />
			<main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center bg-panel p-3 sm:p-5">
				<form className="space-y-4" onSubmit={(event) => void createCatalog(event)}>
					<h1 className="border-b border-white/15 pb-2 text-xl font-bold text-white">Criar catálogo</h1>
					<label className="block text-sm">
						Título
						<input className="mt-1 block w-full bg-panel-muted px-3 py-2 text-sm text-white placeholder:text-cream/70" maxLength={200} placeholder="Título do catálogo" value={titulo} onChange={(event) => setTitulo(event.target.value)} required />
					</label>
					<label className="block text-sm">
						Descrição
						<textarea className="mt-1 block min-h-28 w-full resize-y bg-panel-muted px-3 py-2 text-sm text-white placeholder:text-cream/70" maxLength={5000} placeholder="Descreva o catálogo" value={descricao} onChange={(event) => setDescricao(event.target.value)} />
					</label>
					<fieldset className="space-y-2">
						<legend className="mb-2 text-sm font-semibold">Monetizações</legend>
						{monetizationOptions.map((option) => (
							<div key={option.key} className="grid min-h-11 grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)] items-center gap-3 border-b border-white/10 py-2">
								<label className="flex items-center gap-2 text-sm">
									<input type="checkbox" checked={selected[option.key]} onChange={(event) => setSelected((current) => ({ ...current, [option.key]: event.target.checked }))} />
									{option.label}
								</label>
								{option.key !== "gratuito" && <label className="flex items-center bg-panel-muted px-2 text-xs text-cream/80">
									<span className="mr-1">R$</span>
									<input className="h-8 min-w-0 flex-1 bg-transparent text-white outline-none disabled:opacity-50" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0,00" aria-label={`Preço ${option.label}`} disabled={!selected[option.key]} value={prices[option.key]} onChange={(event) => setPrices((current) => ({ ...current, [option.key]: event.target.value }))} />
									{option.key === "semanal" ? <span>/semana</span> : option.key === "mensal" ? <span>/mês</span> : null}
								</label>}
								{option.key === "gratuito" && <span className="text-right text-xs text-cream/70">Sem cobrança</span>}
							</div>
						))}
					</fieldset>
					<div className="flex flex-col-reverse items-end gap-3 sm:flex-row sm:justify-between sm:items-center">
						<p className={`text-xs ${error ? "text-red" : "text-cream/75"}`} role={error ? "alert" : "status"} aria-live="polite">{message}</p>
						<button type="submit" disabled={saving} className="bg-ink px-8 py-2 text-sm font-bold text-white hover:bg-gold hover:text-navy disabled:cursor-wait disabled:opacity-60">
							{saving ? "CRIANDO..." : "CRIAR CATÁLOGO"}
						</button>
					</div>
				</form>
			</main>
		</div>
	);
}
