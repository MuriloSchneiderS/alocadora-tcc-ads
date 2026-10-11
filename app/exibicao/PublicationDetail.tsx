'use client';

import { collection, doc, getDoc, getDocs, Timestamp } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import Link from "next/link";
import { useEffect, useState } from "react";
import { db, storage } from "../../lib/firebase";
import AcquisitionOptions from "../components/AcquisitionOptions";
import ChannelInfo from "../components/ChannelInfo";
import Header from "../components/Header";
import MediaCard from "../components/MediaCard";
import VideoPlayer from "../components/VideoPlayer";
import { useAuth } from "../providers";
import { DEFAULT_CHANNEL_TITLE, DEFAULT_USER_AVATAR } from "../../lib/user-profile";

type PublicationView = {
  titulo: string;
  descricao: string;
  miniatura: string;
  criador: string;
  arquivo: string;
  tipo: string;
  url: string;
  channelName: string;
  channelTitle: string;
  channelAvatar: string;
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

function Viewer({ publication }: { publication: PublicationView }) {
  const mimeType = getMimeType(publication.arquivo, publication.tipo);
  if (!publication.url)
    return <div className="flex h-full min-h-48 items-center justify-center bg-panel p-6 text-center text-sm text-cream/70">Este conteúdo não está disponível para esta conta.</div>;
  if (publication.tipo === "video") {
    const fallback = <a href={publication.url} target="_blank" rel="noreferrer" className="mt-3 inline-block border border-cream/30 px-4 py-2 text-sm hover:border-gold hover:bg-gold hover:text-navy">Abrir ou baixar arquivo</a>;
    return <VideoPlayer src={publication.url} type={mimeType} title={publication.titulo} fallback={fallback} />;
  }
  if (publication.tipo === "audio") return <div className="flex min-h-48 items-center justify-center bg-panel p-6"><audio className="w-full" controls preload="metadata" src={publication.url} /></div>;
  if (publication.tipo === "imagem") return <img src={publication.url} alt={publication.titulo} className="h-full w-full object-contain" />;
  if (mimeType === "application/pdf") return <iframe title={publication.titulo} src={publication.url} className="h-full min-h-[60vh] w-full border-0 bg-white" />;
  return <div className="flex min-h-48 flex-col items-center justify-center bg-panel p-6 text-center"><p>Este formato não possui visualização direta no navegador.</p><a href={publication.url} target="_blank" rel="noreferrer" className="mt-3 border border-cream/30 px-4 py-2 text-sm hover:border-gold hover:bg-gold hover:text-navy">Abrir ou baixar arquivo</a></div>;
}

export default function PublicationDetail({ publicationId }: { publicationId: string }) {
  const { user } = useAuth();
  const [publication, setPublication] = useState<PublicationView | null>(null);
  const [message, setMessage] = useState("Carregando publicação...");
  const [thumbnailOrientation, setThumbnailOrientation] = useState<{ src: string; isPortrait: boolean } | null>(null);
  const [creatorPublications, setCreatorPublications] = useState<RelatedPublication[]>([]);
  const [recommendations, setRecommendations] = useState<RelatedPublication[]>([]);
  const [relatedMessage, setRelatedMessage] = useState("Carregando publicações...");

  useEffect(() => {
    let isCurrent = true;

    async function loadPublication() {
      try {
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
        try {
          url = await getDownloadURL(ref(storage, archivePath));
        } catch {
          url = "";
        }
        const profile = profileSnapshot.data();
        if (isCurrent) {
          setPublication({
            titulo: String(data.titulo ?? "Sem título"),
            descricao: String(data.descricao ?? ""),
            miniatura: String(data.miniatura ?? ""),
            criador: creatorId,
            arquivo: archivePath,
            tipo: String(data.tipo ?? "livro"),
            url,
            channelName: String(profile?.nome ?? "Criador"),
            channelTitle: String(profile?.titulo || DEFAULT_CHANNEL_TITLE),
            channelAvatar: String(profile?.avatar || DEFAULT_USER_AVATAR),
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
    return () => { isCurrent = false; };
  }, [publicationId]);

  const isOwner = Boolean(user && publication?.criador === user.uid);
  const thumbnailIsPortrait = Boolean(
    publication?.miniatura
      && thumbnailOrientation?.src === publication.miniatura
      && thumbnailOrientation.isPortrait,
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
          <div className="aspect-video overflow-hidden bg-black lg:min-h-[60vh] lg:aspect-auto"><Viewer publication={publication} /></div>
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
              /></div>}
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
          <div>
            <h2 className="mb-2 text-sm">Outros de {publication.channelName}</h2>
            {creatorPublications.length > 0
              ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{relatedCards(creatorPublications)}</div>
              : <p className="py-3 text-xs text-cream/70">{relatedMessage || "Este criador ainda não tem outras publicações."}</p>}
            <h2 className="mb-2 mt-5 text-sm">Recomendações</h2>{/*Publicacoes mais recentes,ainda não tem algoritmo*/}
            {recommendations.length > 0
              ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{relatedCards(recommendations)}</div>
              : <p className="py-3 text-xs text-cream/70">{relatedMessage || "Nenhuma recomendação disponível."}</p>}
          </div>
          <aside>
            <h2 className="mb-2 text-sm">Avaliações</h2>
            <section className="bg-panel" aria-label="Avaliações">
              {/* Placeholder de avaliações, ainda não implementado*/}
              <div className="border-b border-white/10 p-3"><span className="text-2xl tracking-widest">☆☆☆☆☆</span><p className="mt-2 text-xs text-cream/70">MWWP720</p><p className="mt-3 text-xs">From the man who brought the amazing concept from Spider-Man into the wider verse.</p></div>
              <div className="p-3"><span className="text-2xl tracking-widest">★★★★★</span><p className="mt-2 text-xs text-cream/70">hanaparkhill35565</p><p className="mt-3 text-xs">Alberto Mielgo is amazing. This short film is a beautiful experience.</p></div>
            </section>
          </aside>
        </section>}
      </main>
    </div>
  );
}