'use client';

import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { getBytes, ref } from "firebase/storage";
import { zipSync } from "fflate";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { db, storage } from "../../lib/firebase";
import Header from "../components/Header";
import AcquisitionOptions from "../components/AcquisitionOptions";
import ChannelInfo from "../components/ChannelInfo";
import MediaCard from "../components/MediaCard";
import Reviews from "../components/Reviews";
import { useAcquisitionState } from "../hooks/useAcquisitionState";
import { useAuth } from "../providers";
import { DEFAULT_CHANNEL_TITLE, DEFAULT_USER_AVATAR } from "../../lib/user-profile";

type Publication = {
  id: string;
  titulo: string;
  descricao: string;
  miniatura: string;
  duracao: number;
  arquivo: string;
  tamanho: number;
  monetizacoes: { label: string; price: string; tipo?: string }[];
};

type Monetization = { tipo: string; preco: number; duracao?: number };

type Catalog = {
  id: string;
  titulo: string;
  descricao: string;
  miniatura: string;
  criador: string;
  publicacoes: string[];
  monetizacoes: Monetization[];
  avaliacao: number;
};

type LoadedCatalog = {
  catalogId: string;
  catalog?: Catalog;
  items: Publication[];
  available: Publication[];
  creatorName: string;
  creatorTitle?: string;
  creatorAvatar?: string;
  error?: string;
};

const emptyThumbnail = "/assets/catalogo_vazio.png";

//converte os dados do Firestore em um objeto Publication, incluindo as monetizações
function toPublication(id: string, data: Record<string, unknown>, monetizacoes: Monetization[]): Publication {
  const acquisitions = monetizacoes.map((item) => {
    const price = item.preco === 0
      ? "R$0"
      : `R$${(item.preco / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    if (item.tipo === "gratuito") return { label: "Acesso gratuito", price, tipo: item.tipo };
    if (item.tipo === "aluguel") return { label: `Alugue por ${item.duracao ?? 7} dias`, price, tipo: item.tipo };
    return { label: "Compre", price, tipo: item.tipo };
  });

  return {
    id,
    titulo: String(data.titulo ?? "Sem título"),
    descricao: String(data.descricao ?? ""),
    miniatura: String(data.miniatura || emptyThumbnail),
    duracao: Number(data.duracao ?? 0),
    arquivo: String(data.arquivo ?? ""),
    tamanho: Number(data.tamanho ?? 0),
    monetizacoes: acquisitions,
  };
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "publicacao";
}
function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function toAcquisitionOption(item: Monetization) {
  if (item.tipo === "gratuito") return { label: "Acesso gratuito", price: "Grátis", tipo: item.tipo };
  const price = `R$${(item.preco / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  if (item.tipo === "aluguel" && item.duracao === 7) return { label: "Alugue por 7 dias", price, tipo: item.tipo };
  if (item.tipo === "assinatura" && item.duracao === 30) return { label: "Assine mensalmente", price, tipo: item.tipo };
  if (item.tipo === "compra") return { label: "Compre", price, tipo: item.tipo };
  return { label: "Acesse", price, tipo: item.tipo };
}

export default function CatalogDetail({ catalogId }: { catalogId: string }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { acquisitionState, isAcquisitionLoading } = useAcquisitionState("catalogo", catalogId);
  const [loaded, setLoaded] = useState<LoadedCatalog | null>(null);
  const [selectedPublication, setSelectedPublication] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [catalogMenuOpen, setCatalogMenuOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");
  const draggingId = useRef<string | null>(null);
  const originalOrder = useRef<Publication[] | null>(null);

  async function downloadCatalog() {
    if (!loaded?.catalog || acquisitionState !== "purchased" || isDownloading) return;
    const totalSize = items.reduce((total, publication) => total + publication.tamanho, 0);
    const catalogName = safeFileName(loaded.catalog.titulo);
    //confirma com o usuário se ele deseja continuar com o download, informando a quantidade de arquivos e o tamanho total antes da compactação
    if (!window.confirm(`O download de "${loaded.catalog.titulo}" inclui ${items.length} arquivos, com tamanho total de ${formatFileSize(totalSize)} antes da compactação. Deseja continuar?`)) return;

    setIsDownloading(true);
    setDownloadMessage("");
    try {
      const entries = await Promise.all(items.map(async (publication) => {
        const bytes = await getBytes(ref(storage, publication.arquivo));
        const extension = publication.arquivo.split(".").pop()?.toLowerCase() || "bin";
        const filename = `${catalogName}/${safeFileName(publication.titulo)}-${publication.id.slice(0, 8)}.${extension}`;
        return [filename, new Uint8Array(bytes)] as const;
      }));
      const archive = zipSync(Object.fromEntries(entries), { level: 6 });
      const url = URL.createObjectURL(new Blob([new Uint8Array(archive).buffer], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${catalogName}.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadMessage("Não foi possível baixar todos os arquivos. Verifique sua conexão e o acesso ao catálogo e tente novamente.");
    } finally {
      setIsDownloading(false);
    }
  }

  useEffect(() => {
    let isCurrent = true;

    async function loadCatalog() {
      try {
        const snapshot = await getDoc(doc(db, "catalogo", catalogId));
        if (!snapshot.exists()) {
          if (isCurrent) setLoaded({ catalogId, items: [], available: [], creatorName: "", error: "Catálogo não encontrado." });
          return;
        }

        const data = snapshot.data();
        const ids = Array.isArray(data.publicacoes) ? data.publicacoes as string[] : [];
        const [itemSnapshots, monetizationSnapshots, ownerSnapshot, ownPublicationSnapshots] = await Promise.all([
          Promise.all(ids.map((id) => getDoc(doc(db, "publicacao", id)))),
          getDocs(collection(db, "catalogo", catalogId, "monetizacao")),
          getDoc(doc(db, "usuario", String(data.criador ?? ""))),
          user ? getDocs(query(collection(db, "publicacao"), where("criador", "==", user.uid))) : Promise.resolve(null),
        ]);
        const items = (await Promise.all(itemSnapshots.map(async (item) => {
          if (!item.exists()) return null;
          const monetizationSnapshots = await getDocs(collection(db, "publicacao", item.id, "monetizacao"));
          const monetizacoes = monetizationSnapshots.docs.map((monetization) => monetization.data() as Monetization);
          return toPublication(item.id, item.data(), monetizacoes);
        }))).filter((item): item is Publication => item !== null);
        const monetizacoes = monetizationSnapshots.docs.map((item) => item.data() as Monetization);
        const catalog: Catalog = {
          id: snapshot.id,
          titulo: String(data.titulo ?? "Sem título"),
          descricao: String(data.descricao ?? ""),
          miniatura: String(data.miniatura || emptyThumbnail),
          criador: String(data.criador ?? ""),
          publicacoes: ids,
          monetizacoes,
          avaliacao: Number(data.avaliacao ?? 0),
        };
        const available = ownPublicationSnapshots
          ? await Promise.all(ownPublicationSnapshots.docs
            .filter((item) => !ids.includes(item.id))
            .map(async (item) => {
              const monetizationSnapshots = await getDocs(collection(db, "publicacao", item.id, "monetizacao"));
              const monetizacoes = monetizationSnapshots.docs.map((monetization) => monetization.data() as Monetization);
              return toPublication(item.id, item.data(), monetizacoes);
            }))
          : [];
        const ownerProfile = ownerSnapshot.data();
        const creatorName = String(ownerProfile?.nome ?? "Criador");
        const creatorTitle = String(ownerProfile?.titulo || DEFAULT_CHANNEL_TITLE);
        const creatorAvatar = String(ownerProfile?.avatar || DEFAULT_USER_AVATAR);

        if (isCurrent) setLoaded({ catalogId, catalog, items, available, creatorName, creatorTitle, creatorAvatar });
      } catch {
        if (isCurrent) setLoaded({ catalogId, items: [], available: [], creatorName: "", error: "Não foi possível carregar este catálogo." });
      }
    }

    void loadCatalog();
    return () => { isCurrent = false; };
  }, [catalogId, user]);

  async function addPublication() {
    if (!user || !loaded?.catalog || !selectedPublication || saving) return;
    const publication = loaded.available.find((item) => item.id === selectedPublication);
    if (!publication) return;

    setSaving(true);
    setError(false);
    setMessage("Adicionando publicação...");
    try {
      const response = await fetch("/api/catalogo", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ catalogId, publicationId: publication.id }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        if (response.status === 403) throw new Error("Só é possível adicionar publicações próprias a um catálogo próprio.");
        if (result?.error === "already-added") throw new Error("Essa publicação já está no catálogo.");
        if (result?.error === "content-not-found") throw new Error("O catálogo ou a publicação não foi encontrado.");
        throw new Error("Não foi possível adicionar a publicação.");
      }

      setLoaded((current) => current?.catalogId !== catalogId || !current.catalog ? current : {
        ...current,
        catalog: {
          ...current.catalog,
          publicacoes: [...current.catalog.publicacoes, publication.id],
          miniatura: current.catalog.publicacoes.length === 0 ? publication.miniatura : current.catalog.miniatura,
        },
        items: [...current.items, publication],
        available: current.available.filter((item) => item.id !== publication.id),
      });
      setSelectedPublication("");
      setMessage("Publicação adicionada ao catálogo.");
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : "Não foi possível adicionar a publicação.");
    } finally {
      setSaving(false);
    }
  }

  async function removePublication(publication: Publication) {
    if (!user || !loaded?.catalog || loaded.catalog.criador !== user.uid || saving) return;
    if (!window.confirm(`Remover "${publication.titulo}" deste catálogo? A publicação continuará no seu canal.`)) return;

    setSaving(true);
    setError(false);
    setMessage("Removendo publicação do catálogo...");
    try {
      const response = await fetch("/api/catalogo", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ catalogId, publicationId: publication.id, action: "remove" }),
      });
      if (!response.ok) {
        if (response.status === 403) throw new Error("Só o proprietário pode remover publicações deste catálogo.");
        throw new Error("Não foi possível remover a publicação do catálogo.");
      }

      setLoaded((current) => {
        if (current?.catalogId !== catalogId || !current.catalog) return current;
        const items = current.items.filter((item) => item.id !== publication.id);
        return {
          ...current,
          catalog: {
            ...current.catalog,
            publicacoes: current.catalog.publicacoes.filter((id) => id !== publication.id),
            miniatura: items[0]?.miniatura || emptyThumbnail,
          },
          items,
          available: [...current.available, publication],
        };
      });
      setMessage("Publicação removida do catálogo.");
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : "Não foi possível remover a publicação do catálogo.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCatalog() {
    if (!user || !loaded?.catalog || loaded.catalog.criador !== user.uid || saving) return;
    if (!window.confirm(`Excluir permanentemente o catálogo "${loaded.catalog.titulo}"? As publicações continuarão no seu canal.`)) return;
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
        body: JSON.stringify({ catalogId }),
      });
      if (!response.ok) throw new Error("Não foi possível excluir o catálogo.");
      router.push("/catalogo");
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : "Não foi possível excluir o catálogo.");
      setSaving(false);
    }
  }

  function startReordering(publicationId: string) {
    if (!isOwner || saving || !loaded || loaded.catalogId !== catalogId) return;
    draggingId.current = publicationId;
    originalOrder.current = loaded.items.slice();
    setReorderingId(publicationId);
    setMessage("Arraste para escolher a nova posição.");
  }

  function moveReordering(clientX: number, clientY: number) {
    const movingId = draggingId.current;
    if (!movingId) return;
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-publication-id]");
    const targetId = target?.dataset.publicationId;
    if (!targetId || targetId === movingId) return;

    const targetBounds = target.getBoundingClientRect();
    const placeAfterTarget = clientY >= targetBounds.top + targetBounds.height / 2;
    setLoaded((current) => {
      if (current?.catalogId !== catalogId || !current.catalog) return current;
      const items = current.items.slice();
      const sourceIndex = items.findIndex((item) => item.id === movingId);
      const targetIndex = items.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;

      const [movingItem] = items.splice(sourceIndex, 1);
      let insertionIndex = targetIndex + (placeAfterTarget ? 1 : 0);
      if (sourceIndex < insertionIndex) insertionIndex -= 1;
      items.splice(insertionIndex, 0, movingItem);
      if (items.every((item, index) => item.id === current.items[index]?.id)) return current;

      return {
        ...current,
        items,
        catalog: {
          ...current.catalog,
          publicacoes: items.map((item) => item.id),
          miniatura: items[0]?.miniatura || emptyThumbnail,
        },
      };
    });
  }

  async function finishReordering() {
    const movingId = draggingId.current;
    draggingId.current = null;
    setReorderingId(null);
    if (!movingId || !user || !loaded?.catalog || loaded.catalogId !== catalogId) return;

    const publicationIds = loaded.items.map((item) => item.id);
    const previousItems = originalOrder.current;
    originalOrder.current = null;
    if (previousItems?.every((item, index) => item.id === publicationIds[index])) {
      setMessage("");
      return;
    }

    setSaving(true);
    setError(false);
    try {
      const response = await fetch("/api/catalogo", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ catalogId, action: "reorder", publicationIds }),
      });
      if (!response.ok) throw new Error("Não foi possível salvar a nova sequência.");
      setMessage("Sequência atualizada.");
    } catch (caught) {
      if (previousItems) {
        setLoaded((current) => current?.catalogId !== catalogId || !current.catalog ? current : {
          ...current,
          items: previousItems,
          catalog: {
            ...current.catalog,
            publicacoes: previousItems.map((item) => item.id),
            miniatura: previousItems[0]?.miniatura || emptyThumbnail,
          },
        });
      }
      setError(true);
      setMessage(caught instanceof Error ? caught.message : "Não foi possível salvar a nova sequência.");
    } finally {
      setSaving(false);
    }
  }

  const catalog = loaded?.catalogId === catalogId ? loaded.catalog : undefined;
  const items = loaded?.catalogId === catalogId ? loaded.items : [];
  const available = loaded?.catalogId === catalogId ? loaded.available : [];
  const isOwner = Boolean(user && catalog?.criador === user.uid);
  const thumbnail = items[0]?.miniatura || catalog?.miniatura || emptyThumbnail;

  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto grid max-w-[1800px] gap-4 px-3 py-4 lg:grid-cols-[1fr_1fr] sm:px-5">
        <section className="min-w-0 space-y-3" aria-label="Publicações do catálogo">
          {items.map((publication) => <MediaCard
            key={publication.id}
            title={publication.titulo}
            image={publication.miniatura}
            meta={publication.descricao}
            duration={formatDuration(publication.duracao)}
            href={`/exibicao?publicationId=${publication.id}`}
            acquisitions={publication.monetizacoes}
            variant="row"
            manageMenu={isOwner}
            onEdit={() => router.push(`/exibicao?publicationId=${publication.id}`)}
            onRemove={() => void removePublication(publication)}
            reorderId={isOwner ? publication.id : undefined}
            isReordering={reorderingId === publication.id}
            onReorderStart={() => startReordering(publication.id)}
            onReorderMove={moveReordering}
            onReorderEnd={() => void finishReordering()}
          />)}
          {catalog && items.length === 0 && <p className="border-b border-white/10 py-8 text-center text-sm text-cream/70">Este catálogo ainda não tem publicações.</p>}
          {!catalog && !loaded?.error && <p className="py-12 text-center text-sm text-cream/70">{isLoading ? "Verificando sessão..." : "Carregando catálogo..."}</p>}
          {loaded?.error && <p className="py-12 text-center text-sm text-red" role="alert">{loaded.error}</p>}
          {catalog && isOwner &&
            <section className="border-t border-white/15 pt-4" aria-label="Adicionar publicação">
              <h2 className="mb-2 text-sm font-bold text-white">Adicionar publicação</h2>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select className="min-w-0 flex-1 bg-panel-muted px-3 py-2 text-sm text-white" value={selectedPublication} onChange={(event) => setSelectedPublication(event.target.value)} disabled={saving}>
                  <option value="">Selecionar publicação própria</option>
                  {available.map((publication) => <option key={publication.id} value={publication.id}>{publication.titulo}</option>)}
                </select>
                <button type="button" disabled={!selectedPublication || saving} onClick={() => void addPublication()} className="bg-panel-muted px-4 py-2 text-sm font-semibold text-white hover:bg-gold hover:text-navy disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? "ADICIONANDO..." : "ADICIONAR"}
                </button>
              </div>
              {available.length === 0 && <p className="mt-2 text-xs text-cream/70">Todas as suas publicações já estão no catálogo ou você ainda não publicou conteúdo.</p>}
              <p className={`mt-2 text-xs ${error ? "text-red" : "text-cream/75"}`} role={error ? "alert" : "status"} aria-live="polite">{message}</p>
            </section>
          }
        </section>

        {catalog && <div className="flex min-w-0 flex-col gap-4">
          <aside className="flex flex-col gap-6 border border-white/10 bg-panel p-3 sm:p-5">
          <div className="grid gap-5 sm:grid-cols-[minmax(150px,220px)_1fr]">
            <div>
              <div className="aspect-3/4 overflow-hidden border-2 border-orange bg-panel-muted">
                <img src={thumbnail} alt={`Miniatura do catálogo ${catalog.titulo}`} className="h-full w-full object-cover" />
              </div>
              <p className="bg-ink py-1 text-center text-sm">{catalog.publicacoes.length} itens</p>
            </div>
            <div className="min-w-0 text-right text-sm leading-relaxed text-cream/85">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h1 className="min-w-0 flex-1 text-xl text-white">{catalog.titulo}</h1>
                {isOwner && <div className="relative shrink-0">
                  <button type="button" className="px-2 text-xl leading-none text-cream/80 hover:text-gold" aria-label="Opções do catálogo" aria-haspopup="menu" aria-expanded={catalogMenuOpen} onClick={() => setCatalogMenuOpen((open) => !open)}>≡</button>
                  {catalogMenuOpen && <div className="absolute right-0 top-full z-20 min-w-44 border border-white/15 bg-panel p-1 text-left shadow-lg" role="menu">
                    <Link href={`/publicacao_catalogo?edit=${catalog.id}`} role="menuitem" className="block px-3 py-2 text-xs text-cream hover:bg-gold hover:text-navy" onClick={() => setCatalogMenuOpen(false)}>Editar catálogo</Link>
                    <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-xs text-cream hover:bg-red hover:text-white" onClick={() => { setCatalogMenuOpen(false); void deleteCatalog(); }}>Excluir catálogo</button>
                  </div>}
                </div>}
              </div>
              <p className="whitespace-pre-line">{catalog.descricao}</p>
              <ChannelInfo
                channelId={catalog.criador}
                name={loaded?.creatorName || "Criador"}
                title={loaded?.creatorTitle}
                avatar={loaded?.creatorAvatar || DEFAULT_USER_AVATAR}
                className="mt-5 justify-end"
              />
            </div>
          </div>
          <div className="border-t border-white/10 pt-4">
            <div className="catalog-acquisition-options">
              <AcquisitionOptions
                direction="inline"
                options={catalog.monetizacoes.map(toAcquisitionOption)}
                originType="catalogo"
                originId={catalog.id}
                ownerId={catalog.criador}
                acquisitionState={acquisitionState}
                isAcquisitionLoading={isAcquisitionLoading}
                onDownload={() => void downloadCatalog()}
                isDownloading={isDownloading}
              />
              {downloadMessage && <p className="mt-2 text-xs text-red" role="alert">{downloadMessage}</p>}
            </div>
          </div>
          </aside>
          <Reviews targetType="catalog" targetId={catalog.id} initialAverage={catalog.avaliacao} />
        </div>}
      </main>
    </div>
  );
}