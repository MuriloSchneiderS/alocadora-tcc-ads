'use client';

import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import Link from "next/link";
import { useEffect, useState } from "react";
import { db, storage } from "../../lib/firebase";
import AcquisitionOptions from "../components/AcquisitionOptions";
import ChannelInfo from "../components/ChannelInfo";
import Header from "../components/Header";
import VideoPlayer from "../components/VideoPlayer";
import { useAuth } from "../providers";
import { DEFAULT_CHANNEL_TITLE, DEFAULT_USER_AVATAR } from "../../lib/user-profile";

type PublicationView = {
  titulo: string;
  descricao: string;
  criador: string;
  arquivo: string;
  tipo: string;
  url: string;
  channelName: string;
  channelTitle: string;
  channelAvatar: string;
  monetizacoes: { label: string; price: string }[];
};

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
    if (item.tipo === "gratuito") return { label: "Acesso gratuito", price };
    if (item.tipo === "aluguel") return { label: `Alugue por ${item.duracao ?? 7} dias`, price };
    return { label: "Compre", price };
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
      } catch (caught) {
        if (isCurrent) setMessage(caught instanceof Error ? caught.message : "Não foi possível carregar a publicação.");
      }
    }

    void loadPublication();
    return () => { isCurrent = false; };
  }, [publicationId]);

  const isOwner = Boolean(user && publication?.criador === user.uid);

  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto max-w-[1800px] px-3 py-3 sm:px-5">
        {!publication && <p className="py-12 text-center text-sm text-cream/70" role="status">{message}</p>}
        {publication && <section className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="aspect-video overflow-hidden bg-black lg:min-h-[60vh] lg:aspect-auto"><Viewer publication={publication} /></div>
          <aside className="flex flex-col bg-panel p-3">
            <h1 className="mt-2 text-xl font-semibold text-white">{publication.titulo}</h1>
            <p className="mt-2 text-sm leading-tight text-cream/80">{publication.descricao}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
              {isOwner && <Link href={`/publicacao?edit=${publicationId}`} className="bg-panel-muted px-4 py-2 text-sm text-white hover:bg-gold hover:text-navy">Editar publicação</Link>}
              <ChannelInfo channelId={publication.criador} name={publication.channelName} title={publication.channelTitle} avatar={publication.channelAvatar} />
            </div>
            {publication.monetizacoes.length > 0 && <div className="mt-5"><AcquisitionOptions direction="inline" options={publication.monetizacoes} /></div>}
          </aside>
        </section>}
      </main>
    </div>
  );
}