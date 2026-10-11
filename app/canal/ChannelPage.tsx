"use client";

import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, Timestamp, where } from "firebase/firestore";
import { useEffect, useState } from "react";

import { db } from "../../lib/firebase";
import { DEFAULT_CHANNEL_TITLE, DEFAULT_USER_AVATAR, type UserProfile } from "../../lib/user-profile";
import Header from "../components/Header";
import MediaCard from "../components/MediaCard";
import { useAuth } from "../providers";

type ChannelPageProps = {
  channelId: string;
};

type Monetization = {
  tipo: string;
  preco: number;
  duracao?: number;
};

type ChannelItem = {
  id: string;
  tipo: "publicacao" | "catalogo";
  criadoEm: number;
  titulo: string;
  descricao: string;
  miniatura: string;
  duracao: string;
  href: string;
  monetizacoes: string[];
};

type LoadedChannel = {
  id: string;
  profile: UserProfile;
  items: ChannelItem[];
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

function formatMonetization(item: Monetization) {
  if (item.tipo === "gratuito") return "gratuito";
  const price = `R$${(item.preco / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  if (item.tipo === "aluguel" && item.duracao === 7) return `${price}/semana`;
  if (item.tipo === "assinatura" && item.duracao === 30) return `${price}/mês`;
  return price;
}

export default function ChannelPage({ channelId }: ChannelPageProps) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [channelResult, setChannelResult] = useState<{
    id: string;
    channel: LoadedChannel | null;
    error?: string;
  } | null>(null);
  const [selectedSection, setSelectedSection] = useState<"tudo" | "publicacoes" | "catalogos">("tudo");
  const isOwnChannel = Boolean(user && user.uid === channelId);

  useEffect(() => {
    if (isAuthLoading) return;

    let isCurrent = true;

    async function loadChannel() {
      try {
        const [profileSnapshot, publicationSnapshots, catalogSnapshots] = await Promise.all([
          getDoc(doc(db, "usuario", channelId)),
          getDocs(query(collection(db, "publicacao"), where("criador", "==", channelId))),
          getDocs(query(collection(db, "catalogo"), where("criador", "==", channelId))),
        ]);

        if (!profileSnapshot.exists() && !isOwnChannel) {
          if (isCurrent) setChannelResult({ id: channelId, channel: null });
          return;
        }

        const profileData = profileSnapshot.data();
        const profile: UserProfile = {
          nome: String(profileData?.nome || (isOwnChannel ? user?.displayName : "") || "Criador"),
          titulo: String(profileData?.titulo || DEFAULT_CHANNEL_TITLE),
          descricao: String(profileData?.descricao ?? ""),
          avatar: String(profileData?.avatar || (isOwnChannel ? user?.photoURL : "") || DEFAULT_USER_AVATAR),
        };

        const [publications, catalogs] = await Promise.all([
          Promise.all(publicationSnapshots.docs.map(async (snapshot) => {
            const data = snapshot.data();
            const monetizations = await getDocs(collection(db, "publicacao", snapshot.id, "monetizacao"));
            return {
              id: snapshot.id,
              tipo: "publicacao" as const,
              criadoEm: timestampToMillis(data.data_criacao),
              titulo: String(data.titulo ?? "Sem título"),
              descricao: String(data.descricao ?? ""),
              miniatura: String(data.miniatura || "/assets/catalogo_vazio.png"),
              duracao: formatDuration(Number(data.duracao ?? 0)),
              href: `/exibicao?publicationId=${encodeURIComponent(snapshot.id)}`,
              monetizacoes: monetizations.docs.map((item) => formatMonetization(item.data() as Monetization)),
            };
          })),
          Promise.all(catalogSnapshots.docs.map(async (snapshot) => {
            const data = snapshot.data();
            const monetizations = await getDocs(collection(db, "catalogo", snapshot.id, "monetizacao"));
            const publications = Array.isArray(data.publicacoes) ? data.publicacoes : [];
            return {
              id: snapshot.id,
              tipo: "catalogo" as const,
              criadoEm: timestampToMillis(data.data_criacao),
              titulo: String(data.titulo ?? "Sem título"),
              descricao: String(data.descricao ?? ""),
              miniatura: String(data.miniatura || "/assets/catalogo_vazio.png"),
              duracao: `${publications.length} itens`,
              href: `/catalogo/${encodeURIComponent(snapshot.id)}`,
              monetizacoes: monetizations.docs.map((item) => formatMonetization(item.data() as Monetization)),
            };
          })),
        ]);

        const items = [...publications, ...catalogs].sort((first, second) => second.criadoEm - first.criadoEm);
        if (isCurrent) setChannelResult({ id: channelId, channel: { id: channelId, profile, items } });
      } catch (caught) {
        if (isCurrent) {
          setChannelResult({
            id: channelId,
            channel: null,
            error: caught instanceof Error ? caught.message : "Não foi possível carregar este canal.",
          });
        }
      }
    }

    void loadChannel();
    return () => { isCurrent = false; };
  }, [channelId, isAuthLoading, isOwnChannel, user]);

  const tabClass = (section: "tudo" | "publicacoes" | "catalogos") =>
    `flex shrink-0 items-stretch border-r border-white/15 text-sm sm:text-lg ${selectedSection === section ? "bg-cream text-ink" : "text-cream hover:bg-panel"}`;
  const currentChannelResult = channelResult?.id === channelId ? channelResult : null;
  const channel = currentChannelResult?.channel ?? null;
  const isLoading = isAuthLoading || currentChannelResult === null;
  const error = currentChannelResult?.error ?? "";
  const filteredItems = channel?.items.filter((item) =>
    selectedSection === "tudo"
      || (selectedSection === "publicacoes" ? item.tipo === "publicacao" : item.tipo === "catalogo"),
  ) ?? [];

  if (isAuthLoading || isLoading)
    return <main className="flex min-h-screen items-center justify-center bg-ink text-sm text-cream">Carregando canal...</main>;

  if (!channel) {
    return <div className="min-h-screen bg-ink text-cream"><Header /><main className="mx-auto max-w-3xl px-5 py-12 text-center">
      <h1 className="text-2xl text-white">{error ? "Não foi possível carregar o canal" : "Canal não encontrado"}</h1>
      {error && <p role="alert" className="mt-2 text-sm text-red">{error}</p>}
      <Link className="mt-4 inline-block text-orange underline" href="/">Voltar ao início</Link>
    </main></div>;
  }

  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto max-w-[1800px] px-3 py-2 sm:px-5">
        <section className="border border-white/10 bg-panel p-3 sm:p-4">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <p className="max-w-3xl whitespace-pre-line text-sm leading-tight text-cream/85">{channel.profile.descricao}</p>
            <div className="flex items-center gap-4 lg:min-w-96 lg:justify-end">
              <div className="text-right">
                <h1 className="text-3xl text-white">{channel.profile.nome}</h1>
                <p className="text-2xl text-cream/90">{channel.profile.titulo}</p>
                {isOwnChannel
                  ? <Link href="/painel_controle" className="mt-2 block w-full border border-gold/30 bg-panel-muted px-5 py-2 text-sm font-bold text-white hover:bg-gold hover:text-navy">PAINEL DE CONTROLE</Link>
                  : <button type="button" className="mt-2 w-full border border-gold/30 bg-panel-muted px-8 py-1 text-xl text-white hover:bg-gold hover:text-navy">Seguir</button>}
                <p className="text-right text-sm">{channel.items.filter((item) => item.tipo === "publicacao").length.toLocaleString("pt-BR")} publicações</p>
              </div>
              <img src={channel.profile.avatar} alt={`Avatar de ${channel.profile.nome}`} className="h-24 w-24 rounded-full object-cover" />
            </div>
          </div>
        </section>

        <nav className="mt-1 flex min-w-0 items-center border-b border-white/15" aria-label="Seções do canal">
          <a href="#inicio" onClick={() => setSelectedSection("tudo")} aria-current={selectedSection === "tudo" ? "location" : undefined} className={`${tabClass("tudo")} whitespace-nowrap px-3 py-2 sm:px-8`}>Tudo</a>
          <div className={tabClass("publicacoes")}>
            <a href="#publicacoes" onClick={() => setSelectedSection("publicacoes")} aria-current={selectedSection === "publicacoes" ? "location" : undefined} className="whitespace-nowrap px-3 py-2 sm:px-5">Publicações</a>
            {isOwnChannel && <Link href="/publicacao" className="px-3 py-2 text-xl leading-none hover:bg-gold hover:text-navy" aria-label="Criar publicação" title="Criar publicação">+</Link>}
          </div>
          <div className={tabClass("catalogos")}>
            <a href="#catalogos" onClick={() => setSelectedSection("catalogos")} aria-current={selectedSection === "catalogos" ? "location" : undefined} className="whitespace-nowrap px-3 py-2 sm:px-5">Catálogos</a>
            {isOwnChannel && <Link href="/publicacao_catalogo" className="px-3 py-2 text-xl leading-none hover:bg-gold hover:text-navy" aria-label="Criar catálogo" title="Criar catálogo">+</Link>}
          </div>
          <input className="ml-1 hidden flex-1 bg-transparent px-3 text-xs placeholder:text-cream/60 sm:block" placeholder="PESQUISAR" aria-label="Pesquisar no canal" />
        </nav>

        <div id={selectedSection === "tudo" ? "inicio" : selectedSection}>
          {filteredItems.length > 0
            ? <section className="grid grid-cols-2 gap-4 py-2 md:grid-cols-3 lg:grid-cols-4" aria-label={`${selectedSection === "publicacoes" ? "Publicações" : selectedSection === "catalogos" ? "Catálogos" : "Publicações e catálogos"} de ${channel.profile.nome}`}>
              {filteredItems.map((item) => <MediaCard
                key={`${item.tipo}-${item.id}`}
                title={item.titulo}
                image={item.miniatura}
                meta={item.descricao}
                duration={item.duracao}
                href={item.href}
                monetizations={item.monetizacoes}
                isCatalog={item.tipo === "catalogo"}
                channel={{ channelId: channel.id, name: channel.profile.nome, title: channel.profile.titulo, avatar: channel.profile.avatar }}
              />)}
            </section>
            : <p className="py-12 text-center text-sm text-cream/70">
              {selectedSection === "publicacoes" ? "Nenhuma publicação por enquanto." : selectedSection === "catalogos" ? "Nenhum catálogo por enquanto." : "Nenhum conteúdo por enquanto."}
            </p>}
        </div>
      </main>
    </div>
  );
}
