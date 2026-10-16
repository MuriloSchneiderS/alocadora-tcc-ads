'use client';

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import Header from "../components/Header";
import MonetizationEditor, { formatToCents, toCents, type MonetizationDraft, type MonetizationModel } from "../components/MonetizationEditor";
import { db } from "../../lib/firebase";
import { useAuth } from "../providers";

const modelosMonetizacao: MonetizationModel[] = [
	{ label: "Gratuito", type: "gratuito", free: true },
	{ label: "Aluguel semanal", type: "aluguel", duration: 7 },
	{ label: "Assinatura mensal", type: "assinatura", duration: 30 },
	{ label: "Compra avulsa", type: "compra" },
] as const;

export default function PublicacaoCatalogo() {
	const router = useRouter();
	const { user, isLoading } = useAuth();
	const [titulo, setTitulo] = useState("");
	const [descricao, setDescricao] = useState("");
	const [monetizacoes, setMonetizacoes] = useState<MonetizationDraft[]>([
		{ model: "Gratuito", price: "" },
	]);
	const [saving, setSaving] = useState(false);
	const [editingId, setEditingId] = useState("");
	const [editReady, setEditReady] = useState(true);
	const [message, setMessage] = useState("");
	const [error, setError] = useState(false);

	useEffect(() => {
		if (!isLoading && !user) router.replace("/login");
	}, [isLoading, router, user]);

	useEffect(() => {
		if (!user) return;
		const catalogId = new URLSearchParams(window.location.search).get("edit");
		if (!catalogId) return;
		const editCatalogId = catalogId;
		const uid = user.uid;
		let isCurrent = true;

		async function loadCatalogForEdit() {
			try {
				const snapshot = await getDoc(doc(db, "catalogo", editCatalogId));
				if (!snapshot.exists()) throw new Error("Catálogo não encontrado.");
				const data = snapshot.data();
				if (data.criador !== uid) throw new Error("Somente o criador pode editar este catálogo.");
				const monetizationSnapshots = await getDocs(collection(db, "catalogo", editCatalogId, "monetizacao"));
				const loadedMonetizations = monetizationSnapshots.docs.map((item) => item.data());
				const drafts = loadedMonetizations.flatMap((item) => {
					const model = modelosMonetizacao.find((option) => option.type === item.tipo && (option.duration ?? 0) === Number(item.duracao ?? 0));
					if (!model) return [];
					const price = Number(item.preco ?? 0);
					return [{ model: model.label, price: model.free ? "" : formatToCents(`${Math.floor(price / 100)},${String(price % 100).padStart(2, "0")}`, true) }];
				});
				if (isCurrent) {
					setEditingId(editCatalogId);
					setTitulo(String(data.titulo ?? ""));
					setDescricao(String(data.descricao ?? ""));
					setMonetizacoes(drafts.length > 0 ? drafts : [{ model: "Gratuito", price: "" }]);
				}
			} catch (caught) {
				if (isCurrent) {
					setError(true);
					setMessage(caught instanceof Error ? caught.message : "Não foi possível carregar o catálogo.");
				}
			} finally {
				if (isCurrent) setEditReady(true);
			}
		}

		void loadCatalogForEdit();
		return () => { isCurrent = false; };
	}, [user]);

	async function createCatalog(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!user || saving) return;

		if (!titulo.trim()) {
			setError(true);
			setMessage("Informe o título do catálogo.");
			return;
		}
		if (monetizacoes.some((item) => item.model !== "Gratuito" && toCents(item.price) <= 0)) {
			setError(true);
			setMessage("Informe um preço maior que zero para cada opção paga.");
			return;
		}

		setSaving(true);
		setError(false);
		setMessage(editingId ? "Salvando alterações..." : "Criando catálogo...");
		const catalogId = editingId || crypto.randomUUID();
		try {
			const response = await fetch("/api/catalogo", {
				method: editingId ? "PATCH" : "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${await user.getIdToken()}`,
				},
				body: JSON.stringify({
					catalogId,
					...(editingId ? { action: "edit" } : {}),
					titulo: titulo.trim(),
					descricao: descricao.trim(),
					monetizacoes: monetizacoes.map((item) => {
						const selectedModel = modelosMonetizacao.find((option) => option.label === item.model);
						return {
							tipo: selectedModel?.type ?? "gratuito",
							preco: selectedModel?.free ? 0 : toCents(item.price),
							...(selectedModel?.duration ? { duracao: selectedModel.duration } : {}),
						};
					}),
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

	async function deleteCatalog() {
		if (!user || !editingId || saving) return;
		if (!window.confirm(`Excluir permanentemente o catálogo "${titulo}"? As publicações permanecerão no seu canal.`)) return;
		setSaving(true);
		setError(false);
		setMessage("Excluindo catálogo...");
		try {
			const response = await fetch("/api/catalogo", {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${await user.getIdToken()}`,
				},
				body: JSON.stringify({ catalogId: editingId }),
			});
			if (!response.ok) throw new Error("Não foi possível excluir o catálogo.");
			router.push("/catalogo");
		} catch (caught) {
			setError(true);
			setMessage(caught instanceof Error ? caught.message : "Não foi possível excluir o catálogo.");
			setSaving(false);
		}
	}

	if (isLoading || !user) {
		return <div className="flex min-h-screen flex-col bg-ink text-cream"><Header showSearch={false} showPublish={false} /><main className="flex flex-1 items-center justify-center">Verificando sessão...</main></div>;
	}

	return (
		<div className="flex min-h-screen flex-col bg-ink text-cream">
			<Header showSearch={false} showPublish={false} />
			<main className="mx-auto flex w-full flex-1 flex-col justify-center max-w-3xl bg-panel p-2 sm:p-3">
				<form className="space-y-1" onSubmit={(event) => void createCatalog(event)}>
					{!editReady && <p className="py-3 text-sm text-cream/70">Carregando catálogo...</p>}
					<fieldset disabled={saving || !editReady} className="contents">
						<h1 className="border-b border-white/15 pb-2 text-xl font-bold text-white">{editingId ? "Editar catálogo" : "Criar catálogo"}</h1>
						<div className="space-y-1">
							<input className="w-full bg-panel-muted px-2 py-1 text-sm placeholder:text-cream" maxLength={200} placeholder="Título..." value={titulo} onChange={(event) => setTitulo(event.target.value)} required />
							<textarea className="h-16 w-full resize-none bg-panel-muted px-2 py-1 text-xs placeholder:text-cream" maxLength={5000} placeholder="Descrição..." value={descricao} onChange={(event) => setDescricao(event.target.value)} />
						</div>
						<div className="space-y-2 pt-2">
							<MonetizationEditor models={modelosMonetizacao} value={monetizacoes} onChange={setMonetizacoes} disabled={saving} />
						</div>
						<div className="mt-4 flex flex-wrap justify-end gap-2">
							{editingId && <button type="button" disabled={saving} onClick={() => void deleteCatalog()} className="bg-red px-8 py-2 text-xs text-white hover:bg-red/80 disabled:cursor-wait disabled:opacity-60">EXCLUIR CATÁLOGO</button>}
							<button type="submit" disabled={saving || !editReady} className="bg-ink px-20 py-2 text-xs hover:bg-gold hover:text-navy disabled:cursor-wait disabled:opacity-60">
								{saving ? "SALVANDO..." : editingId ? "SALVAR ALTERAÇÕES" : "CRIAR CATÁLOGO"}
							</button>
						</div>
					</fieldset>
					<p className={`mt-3 text-right text-xs ${error ? "text-red" : ""}`} role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>{message}</p>
				</form>
			</main>
		</div>
	);
}
