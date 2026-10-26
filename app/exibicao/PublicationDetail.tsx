'use client';

import { collection, doc, getDoc, getDocs, Timestamp } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import AcquisitionOptions from "../components/AcquisitionOptions";
import ChannelInfo from "../components/ChannelInfo";
import EpubReader from "../components/EpubReader";
import Header from "../components/Header";
import MediaCard from "../components/MediaCard";
import Reviews from "../components/Reviews";
import VideoPlayer from "../components/VideoPlayer";
import { useAcquisitionState } from "../hooks/useAcquisitionState";
import { useAuth } from "../providers";
import { DEFAULT_CHANNEL_TITLE, DEFAULT_USER_AVATAR } from "../../lib/user-profile";

declare global {//declaração global para permitir o uso de anúncios AdSense
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

type PublicationView = {
  id: string;
  titulo: string;
  descricao: string;
  miniatura: string;
  criador: string;
  arquivo: string;
  tamanho: number;
  tipo: string;
  url: string;
  channelName: string;
  channelTitle: string;
  channelAvatar: string;
  avaliacao: number;
  monetizacoes: { label: string; price: string; tipo?: string }[];
};

type RelatedPublication = {
  id: string;
  titulo: string;
  descricao: string;
  miniatura: string;
  duracao: string;
  criador: string;
  channelName: string;
  channelTitle: string;
  channelAvatar: string;
};

function timestampToMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" ? value : 0;
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

function getMimeType(path: string, type: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (type === "video") return extension === "webm" ? "video/webm" : "video/mp4";
  if (type === "audio") return extension === "mp3" ? "audio/mpeg" : "audio/mp4";
  if (extension === "pdf") return "application/pdf";
  if (extension === "epub") return "application/epub+zip";
  if (type === "imagem") return `image/${extension === "jpg" ? "jpeg" : extension ?? "webp"}`;
  return "application/octet-stream";
}

function toAcquisitionOptions(items: { tipo?: string; preco?: number; duracao?: number }[]) {
  return items.map((item) => {
    const price = Number(item.preco ?? 0) === 0
      ? "Grátis"
      : `R$${(Number(item.preco) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    if (item.tipo === "gratuito") return { label: "Acesso gratuito", price, tipo: item.tipo };
    if (item.tipo === "aluguel") return { label: `Alugue por ${item.duracao ?? 7} dias`, price, tipo: item.tipo };
    return { label: "Compre", price, tipo: item.tipo };
  });
}

//Visualizador para exibir a publicação de acordo com o tipo de arquivo
function Viewer({ publication }: { publication: PublicationView }) {
  const mimeType = getMimeType(publication.arquivo, publication.tipo);
  if (!publication.url)
    return <div className="flex h-full min-h-48 items-center justify-center bg-panel p-6 text-center text-sm text-cream/70">
      Este conteúdo não está disponível para esta conta.
    </div>;

  if (publication.tipo === "video") {//utiliza o componente VideoPlayer para exibir vídeos, com fallback para abrir ou baixar o arquivo
    const fallback = <p className="text-sm text-cream/70">Não foi possível reproduzir este vídeo.</p>;
    return <VideoPlayer src={publication.url} type={mimeType} title={publication.titulo} fallback={fallback} />;
  }

  if (publication.tipo === "audio")//exibe a miniatura acima dos controles do áudio
    return <div
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      className={`flex h-full min-h-48 select-none flex-col overflow-hidden ${publication.miniatura ? "bg-black" : "items-center justify-center bg-panel p-6"}`}
    >
      {publication.miniatura && <img
        src={publication.miniatura}
        alt={`Miniatura de ${publication.titulo}`}
        draggable={false}
        className="min-h-0 w-full flex-1 object-cover opacity-75"
      />}
      <audio className={`block w-full shrink-0 ${publication.miniatura ? "" : "max-w-2xl"}`} controls controlsList="nodownload" preload="metadata" src={publication.url} />
    </div>;

  if (publication.tipo === "imagem")//exibe imagens diretamente no navegador
    return <img
      src={publication.url}
      alt={publication.titulo}
      draggable={false}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      className="h-full w-full select-none object-contain"
    />;

  if (mimeType === "application/pdf")//exibe PDFs diretamente no navegador
    return <iframe
      title={publication.titulo}
      src={`${publication.url}#toolbar=0`}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      className="h-full min-h-[60vh] w-full border-0 bg-white"
    />;

  if (mimeType === "application/epub+zip")//exibe EPUBs utilizando o componente EpubReader, que renderiza o conteúdo com paginação e navegação
    return <EpubReader publicationId={publication.id} title={publication.titulo} />;
    
  /*Futuros formatos:
    Modelos 3D,
    arquivo para impressão 3D,
    Jogos com WebAssembly,
    Transmissão ao vivo
  */

  return <div className="flex min-h-48 flex-col items-center justify-center bg-panel p-6 text-center">
    <p>Este formato não possui visualização direta no navegador.</p>
  </div>;
}

function PublicationAd() {//componente para exibir anúncios AdSense antes do visualizador de publicações gratuitas
  const slot = process.env.NEXT_PUBLIC_ADSENSE_PUBLICATION_SLOT;//obtém o ID do bloco de anúncio do AdSense a partir da variável de ambiente

  useEffect(() => {
    if (!slot) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      console.error("AdSense publication ad failed to load", error);
    }
  }, [slot]);

  if (!slot) return null;

  return (
    <div className="shrink-0 bg-black px-3 py-2 text-center">
      <span className="mb-1 block text-[10px] uppercase text-cream/50">Anúncio</span>
      <ins
        className="adsbygoogle block min-h-[90px] w-full"
        style={{ display: "block" }}
        data-ad-client="ca-pub-9486375314273706"
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

export default function PublicationDetail({ publicationId }: { publicationId: string }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { acquisitionState, isAcquisitionLoading } = useAcquisitionState("publicacao", publicationId);
  const [publication, setPublication] = useState<PublicationView | null>(null);
  const [message, setMessage] = useState("Carregando publicação...");
  const [thumbnailOrientation, setThumbnailOrientation] = useState<{ src: string; isPortrait: boolean } | null>(null);
  const [creatorPublications, setCreatorPublications] = useState<RelatedPublication[]>([]);
  const [recommendations, setRecommendations] = useState<RelatedPublication[]>([]);
  const [relatedMessage, setRelatedMessage] = useState("Carregando publicações...");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");

  //função para baixar a publicação, verificando se o usuário tem acesso e se o download já não está em andamento
  async function downloadPublication() {
    if (!publication?.arquivo || acquisitionState !== "purchased" || isDownloading) return;
    if (!user) {
      setDownloadMessage("Entre na sua conta para baixar esta publicação.");
      return;
    }
    setIsDownloading(true);
    setDownloadMessage("Conectando ao armazenamento...");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const params = new URLSearchParams({
        originType: "publicacao",
        originId: publicationId,
        publicationId,
      });
      const response = await fetch(`/api/payments/download?${params}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error ?? `download-http-${response.status}`);
      }
      setDownloadMessage("Baixando publicação...");
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("storage-empty-file");
      const extension = publication.arquivo.split(".").pop()?.toLowerCase() || "bin";
      const filename = `${publication.titulo.replace(/[\\/:*?"<>|]/g, "-")}.${extension}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadMessage("Download iniciado.");
    } catch (error) {
      console.error("Publication download failed", error);
      setDownloadMessage(error instanceof DOMException && error.name === "AbortError"
        ? "O download excedeu 2 minutos e foi interrompido. Verifique sua conexão e tente novamente."
        : error instanceof Error && error.message === "purchase-required"
          ? "Não foi possível confirmar a compra deste arquivo. Recarregue a página e tente novamente."
          : error instanceof Error && error.message === "file-not-found"
            ? "O arquivo não está mais disponível no armazenamento."
          : "Não foi possível baixar a publicação. Verifique sua conexão e o acesso ao arquivo.");
    } finally {
      window.clearTimeout(timeout);
      setIsDownloading(false);
    }
  }

  //carrega os dados da publicação, do criador e das recomendações, atualizando o estado do componente
  useEffect(() => {//[publicationId]
    let isCurrent = true;
    let previewUrl = "";

    async function loadPublication() {
      try {
        if (isAuthLoading) return;
        const snapshot = await getDoc(doc(db, "publicacao", publicationId));
        if (!snapshot.exists()) throw new Error("Publicação não encontrada.");
        const data = snapshot.data();
        const creatorId = String(data.criador ?? "");
        const [profileSnapshot, monetizationSnapshot] = await Promise.all([
          getDoc(doc(db, "usuario", creatorId)),
          getDocs(collection(db, "publicacao", publicationId, "monetizacao")),
        ]);
        const archivePath = String(data.arquivo ?? "");
        let url = "";
        if (archivePath.toLowerCase().endsWith(".epub")) {
          url = "epub";
        } else {
          try {
            const response = await fetch(`/api/content/file?publicationId=${encodeURIComponent(publicationId)}`, {
              headers: user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {},
              cache: "no-store",
            });
            if (response.ok) {
              previewUrl = URL.createObjectURL(await response.blob());
              url = previewUrl;
            }
          } catch {
            url = "";
          }
        }
        const profile = profileSnapshot.data();
        if (isCurrent) {
          setPublication({
            id: publicationId,
            titulo: String(data.titulo ?? "Sem título"),
            descricao: String(data.descricao ?? ""),
            miniatura: String(data.miniatura ?? ""),
            criador: creatorId,
            arquivo: archivePath,
            tamanho: Number(data.tamanho ?? 0),
            tipo: String(data.tipo ?? "livro"),
            url,
            channelName: String(profile?.nome ?? "Criador"),
            channelTitle: String(profile?.titulo || DEFAULT_CHANNEL_TITLE),
            channelAvatar: String(profile?.avatar || DEFAULT_USER_AVATAR),
            avaliacao: Number(data.avaliacao ?? 0),
            monetizacoes: toAcquisitionOptions(monetizationSnapshot.docs.map((item) => item.data())),
          });
          setMessage("");
        }

        try {
          const publicationSnapshots = await getDocs(collection(db, "publicacao"));//carrega todas as publicações para gerar recomendações
          const recentPublications = publicationSnapshots.docs
            .filter((item) => item.id !== publicationId)
            .map((item) => ({ id: item.id, data: item.data() }))
            .sort((first, second) =>
              timestampToMillis(second.data.data_criacao) - timestampToMillis(first.data.data_criacao),
            );
          const creatorItems = recentPublications
            .filter(({ data }) => String(data.criador ?? "") === creatorId)//filtra publicações do mesmo criador
            .slice(0, 4);
          const recommendationItems = recentPublications
            .filter(({ data }) => String(data.criador ?? "") !== creatorId)//de outros criadores
            .slice(0, 4);
          const selectedItems = [...new Map(
            [...creatorItems, ...recommendationItems].map((item) => [item.id, item]),
          ).values()];
          const creatorIds = [...new Set(selectedItems.map(({ data }) => String(data.criador ?? "")).filter(Boolean))];
          const profiles = new Map<string, Record<string, unknown>>();
          await Promise.all(creatorIds.map(async (id) => {
            const profileSnapshot = await getDoc(doc(db, "usuario", id));
            if (profileSnapshot.exists()) profiles.set(id, profileSnapshot.data());
          }));
          const toRelatedPublication = ({ id, data }: { id: string; data: Record<string, unknown> }): RelatedPublication => {
            const itemCreatorId = String(data.criador ?? "");
            const profile = profiles.get(itemCreatorId);
            return {
              id,
              titulo: String(data.titulo ?? "Sem título"),
              descricao: String(data.descricao ?? ""),
              miniatura: String(data.miniatura || "/assets/catalogo_vazio.png"),
              duracao: formatDuration(Number(data.duracao ?? 0)),
              criador: itemCreatorId,
              channelName: String(profile?.nome ?? "Criador"),
              channelTitle: String(profile?.titulo || DEFAULT_CHANNEL_TITLE),
              channelAvatar: String(profile?.avatar || DEFAULT_USER_AVATAR),
            };
          };

          if (isCurrent) {
            setCreatorPublications(creatorItems.map(toRelatedPublication));
            setRecommendations(recommendationItems.map(toRelatedPublication));
            setRelatedMessage("");
          }
        } catch (caught) {
          if (isCurrent) setRelatedMessage(caught instanceof Error ? caught.message : "Não foi possível carregar outras publicações.");
        }
      } catch (caught) {
        if (isCurrent) setMessage(caught instanceof Error ? caught.message : "Não foi possível carregar a publicação.");
      }
    }

    void loadPublication();
    return () => {
      isCurrent = false;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [isAuthLoading, publicationId, user]);

  const isOwner = Boolean(user && publication?.criador === user.uid);
  const thumbnailIsPortrait = Boolean(
    publication?.miniatura
      && thumbnailOrientation?.src === publication.miniatura
      && thumbnailOrientation.isPortrait,
  );
  //exibe anúncio AdSense antes do visualizador de publicações gratuitas, 
  //se o slot estiver configurado e a publicação for gratuita e o usuário não estiver logado ou não tiver adquirido a publicação
  const shouldShowAdvertisement = Boolean(
    publication?.url
      && publication.monetizacoes.some((option) => option.tipo === "gratuito")
      && !isAuthLoading
      && !isAcquisitionLoading
      && !acquisitionState,
  );
  const relatedCards = (items: RelatedPublication[]) => items.map((item) => <MediaCard
    key={item.id}
    title={item.titulo}
    image={item.miniatura}
    meta={item.descricao}
    duration={item.duracao}
    href={`/exibicao?publicationId=${encodeURIComponent(item.id)}`}
    channel={{ channelId: item.criador, name: item.channelName, title: item.channelTitle, avatar: item.channelAvatar }}
  />);

  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto max-w-[1800px] px-3 py-3 sm:px-5">
        {!publication && <p className="py-12 text-center text-sm text-cream/70" role="status">{message}</p>}
        {publication && <section className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="flex flex-col overflow-hidden ">
            {shouldShowAdvertisement && <PublicationAd />}
            <div className={publication.arquivo.toLowerCase().endsWith(".epub")
              ? "h-[75vh] min-h-[480px] w-full lg:h-[75vh]"
              : "aspect-video w-full lg:min-h-[60vh] lg:aspect-auto"}>
              <Viewer publication={publication} />{/*Visualizador para cada tipo de arquivo*/}
            </div>
          </div>
          <aside className="flex flex-col bg-panel p-3">
            <div className={thumbnailIsPortrait && publication.miniatura ? "flex items-start gap-3" : ""}>
              {publication.miniatura && <img
                src={publication.miniatura}
                alt={`Miniatura de ${publication.titulo}`}
                onLoad={(event) => setThumbnailOrientation({
                  src: publication.miniatura,
                  isPortrait: event.currentTarget.naturalHeight > event.currentTarget.naturalWidth,
                })}
                className={thumbnailIsPortrait
                  ? "max-h-90 w-1/3 shrink-0 object-contain"
                  : "mb-4 block max-h-90 w-full object-contain"}
              />}
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold text-white">{publication.titulo}</h1>
                <p className="mt-2 text-sm leading-tight text-cream/80">{publication.descricao}</p>
              </div>
            </div>
            <div className="mt-auto pt-5">
              {publication.monetizacoes.length > 0 && <div className="mb-4"><AcquisitionOptions
                direction="inline"
                options={publication.monetizacoes}
                originType="publicacao"
                originId={publicationId}
                ownerId={publication.criador}
                acquisitionState={acquisitionState}
                isAcquisitionLoading={isAcquisitionLoading}
                onDownload={() => void downloadPublication()}
                isDownloading={isDownloading}
              /></div>}
              {downloadMessage && <p className="mb-3 text-xs text-red" role="alert">{downloadMessage}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="bg-panel-muted px-5 py-2 text-xl text-white hover:bg-gold hover:text-navy">Seguir</button>
                  {isOwner && <Link href={`/publicacao?edit=${publicationId}`} className="bg-panel-muted px-4 py-2 text-sm text-white hover:bg-gold hover:text-navy">Editar publicação</Link>}
                </div>
                <ChannelInfo channelId={publication.criador} name={publication.channelName} title={publication.channelTitle} avatar={publication.channelAvatar} />
              </div>
            </div>
          </aside>
        </section>}
        {publication && <section className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="min-w-0">
            <h2 className="mb-2 text-sm">Outros de {publication.channelName}</h2>
            {creatorPublications.length > 0
              ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{relatedCards(creatorPublications)}</div>
              : <p className="py-3 text-xs text-cream/70">{relatedMessage || "Este criador ainda não tem outras publicações."}</p>}
            <h2 className="mb-2 mt-5 text-sm">Recomendações</h2>{/*Publicacoes mais recentes,ainda não tem algoritmo*/}
            {recommendations.length > 0
              ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{relatedCards(recommendations)}</div>
              : <p className="py-3 text-xs text-cream/70">{relatedMessage || "Nenhuma recomendação disponível."}</p>}
          </div>
          <Reviews targetType="publication" targetId={publicationId} initialAverage={publication.avaliacao} />
        </section>}
      </main>
    </div>
  );
}