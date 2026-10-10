"use client";

import Link from "next/link";
import { collection, doc, getDoc, getDocs, query, Timestamp, where } from "firebase/firestore";
import { useEffect, useState } from "react";

import { MOCK_CHANNELS } from "../../lib/mock-channels";
import { db } from "../../lib/firebase";
import { DEFAULT_CHANNEL_DESCRIPTION, DEFAULT_CHANNEL_TITLE, DEFAULT_USER_AVATAR, type UserProfile } from "../../lib/user-profile";
import Header from "../components/Header";
import MediaCard from "../components/MediaCard";
import { useAuth } from "../providers";

type ChannelPageProps = {
  channelId: string;
};
type OwnedPublication = {
  id: string;
  titulo: string;
  descricao: string;
  miniatura: string;
  duracao: number;
  criadoEm: number;
  monetizacoes: { tipo: string; preco: number; duracao?: number }[];
};
type OwnedCatalog = {
  id: string;
  titulo: string;
  descricao: string;
  miniatura: string;
  publicacoes: string[];
  criadoEm: number;
  monetizacoes: { tipo: string; preco: number; duracao?: number }[];
};
type ChannelItem = {
  id: string;
  tipo: "publicacao" | "catalogo";
  criadoEm: number;
  titulo: string;
  descricao: string;
  miniatura: string;
  duracao: string;
  href?: string;
  monetizacoes: string[];
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

function formatMonetization(item: { tipo: string; preco: number; duracao?: number }) {
  if (item.tipo === "gratuito") return "gratuito";
  const price = `R$${(item.preco / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  if (item.tipo === "aluguel" && item.duracao === 7) return `${price}/semana`;
  if (item.tipo === "assinatura" && item.duracao === 30) return `${price}/mês`;
  return price;
}

export default function ChannelPage({ channelId }: ChannelPageProps) {
  const { user, isLoading } = useAuth();//hook que retorna o usuário logado e se está carregando
  const [loadedProfile, setLoadedProfile] = useState<{ uid: string; profile: UserProfile } | null>(null);//state para armazenar o perfil do usuário carregado do Firestore
  const [ownedContent, setOwnedContent] = useState<{ uid: string; publications: OwnedPublication[]; catalogs: OwnedCatalog[] } | null>(null);
  const [selectedSection, setSelectedSection] = useState<"tudo" | "publicacoes" | "catalogos">("tudo");

  //Carrega o perfil do usuário logado do Firestore se o canal for do usuário logado
  useEffect(() => {
    if (!user || user.uid !== channelId) return;

    let isCurrent = true;
    getDoc(doc(db, "usuario", user.uid)).then((snapshot) => {
      if (isCurrent && snapshot.exists())
        setLoadedProfile({ uid: user.uid, profile: snapshot.data() as UserProfile });
    }).catch(() => undefined);

    return () => { isCurrent = false; };
  }, [channelId, user]);

  useEffect(() => {
    if (!user || user.uid !== channelId) return;
    const uid = user.uid;
    let isCurrent = true;

    async function loadOwnedContent() {
      try {
        const [publicationSnapshots, catalogSnapshots] = await Promise.all([
          getDocs(query(collection(db, "publicacao"), where("criador", "==", uid))),
          getDocs(query(collection(db, "catalogo"), where("criador", "==", uid))),
        ]);
        const [publications, catalogs] = await Promise.all([
          Promise.all(publicationSnapshots.docs.map(async (snapshot) => {
            const data = snapshot.data();
            const monetizationSnapshots = await getDocs(collection(db, "publicacao", snapshot.id, "monetizacao"));
            return {
              id: snapshot.id,
              titulo: String(data.titulo ?? "Sem título"),
              descricao: String(data.descricao ?? ""),
              miniatura: String(data.miniatura || "/assets/catalogo_vazio.png"),
              duracao: Number(data.duracao ?? 0),
              criadoEm: timestampToMillis(data.data_criacao),
              monetizacoes: monetizationSnapshots.docs.map((item) => item.data() as OwnedPublication["monetizacoes"][number]),
            };
          })),
          Promise.all(catalogSnapshots.docs.map(async (snapshot) => {
            const data = snapshot.data();
            const monetizationSnapshots = await getDocs(collection(db, "catalogo", snapshot.id, "monetizacao"));
            return {
              id: snapshot.id,
              titulo: String(data.titulo ?? "Sem título"),
              descricao: String(data.descricao ?? ""),
              miniatura: String(data.miniatura || "/assets/catalogo_vazio.png"),
              publicacoes: Array.isArray(data.publicacoes) ? data.publicacoes as string[] : [],
              criadoEm: timestampToMillis(data.data_criacao),
              monetizacoes: monetizationSnapshots.docs.map((item) => item.data() as OwnedCatalog["monetizacoes"][number]),
            };
          })),
        ]);

        if (isCurrent) setOwnedContent({ uid, publications, catalogs });
      } catch {
        if (isCurrent) setOwnedContent({ uid, publications: [], catalogs: [] });
      }
    }

    void loadOwnedContent();
    return () => { isCurrent = false; };
  }, [channelId, user]);

  const userProfile = loadedProfile && loadedProfile.uid === user?.uid ? loadedProfile.profile : null;
  const tabClass = (section: "tudo" | "publicacoes" | "catalogos") =>
    `flex shrink-0 items-stretch border-r border-white/15 text-sm sm:text-lg ${selectedSection === section ? "bg-cream text-ink" : "text-cream hover:bg-panel"}`;

  if (isLoading)
    return <main className="flex min-h-screen items-center justify-center bg-ink text-sm text-cream">Carregando canal...</main>;

  const isOwnChannel = Boolean(user && user.uid === channelId);//true se o canal pertence ao usuário logado, false caso contrário
  const mockChannel = MOCK_CHANNELS[channelId];//\lib\mock-channels.ts contém canais de exemplo, onde a chave é o ID do canal
  const channel = isOwnChannel && user
    ? {
      id: user.uid,
      name: userProfile?.nome || user.displayName || user.email?.split("@")[0] || "Meu canal",
      title: userProfile?.titulo ?? DEFAULT_CHANNEL_TITLE,
      avatar: userProfile?.avatar ?? user.photoURL ?? DEFAULT_USER_AVATAR,
      description: userProfile?.descricao ?? DEFAULT_CHANNEL_DESCRIPTION,
      followers: 0,
      publications: ownedContent?.uid === user.uid ? ownedContent.publications.length : 0,
      videos: [],
    }
    : mockChannel;

  const channelItems: ChannelItem[] = ownedContent?.uid === channelId ? [
    ...ownedContent.publications.map((publication) => ({
      id: publication.id,
      tipo: "publicacao" as const,
      criadoEm: publication.criadoEm,
      titulo: publication.titulo,
      descricao: publication.descricao,
      miniatura: publication.miniatura,
      duracao: formatDuration(publication.duracao),
      href: `/exibicao?publicationId=${publication.id}`,
      monetizacoes: publication.monetizacoes.map(formatMonetization),
    })),
    ...ownedContent.catalogs.map((catalog) => ({
      id: catalog.id,
      tipo: "catalogo" as const,
      criadoEm: catalog.criadoEm,
      titulo: catalog.titulo,
      descricao: catalog.descricao,
      miniatura: catalog.miniatura,
      duracao: `${catalog.publicacoes.length} itens`,
      href: `/catalogo/${catalog.id}`,
      monetizacoes: catalog.monetizacoes.map(formatMonetization),
    })),
  ].sort((first, second) => second.criadoEm - first.criadoEm) : [];

  const filteredItems = selectedSection === "publicacoes"
    ? channelItems.filter((item) => item.tipo === "publicacao")
    : selectedSection === "catalogos"
      ? channelItems.filter((item) => item.tipo === "catalogo")
      : channelItems;

  if (!channel) {
    return <div className="min-h-screen bg-ink text-cream"><Header /><main className="mx-auto max-w-3xl px-5 py-12 text-center"><h1 className="text-2xl text-white">Canal não encontrado</h1><Link className="mt-4 inline-block text-orange underline" href="/">Voltar ao início</Link></main></div>;
  }

  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto max-w-[1800px] px-3 py-2 sm:px-5">
        <section className="border border-white/10 bg-panel p-3 sm:p-4">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <p className="max-w-3xl whitespace-pre-line text-sm leading-tight text-cream/85">{channel.description}</p>
            <div className="flex items-center gap-4 lg:min-w-96 lg:justify-end justify-content-end">
              <div className="text-right">
                <h1 className="text-3xl text-white">{channel.name}</h1>
                <p className="text-2xl text-cream/90">{channel.title}</p>
                {isOwnChannel
                  ? <Link href="/painel_controle" className="mt-2 block w-full border border-gold/30 bg-panel-muted px-5 py-2 text-sm font-bold text-white hover:bg-gold hover:text-navy">PAINEL DE CONTROLE</Link>
                  : <button type="button" className="mt-2 w-full border border-gold/30 bg-panel-muted px-8 py-1 text-xl text-white hover:bg-gold hover:text-navy">Seguir</button>}
                <p className="text-right text-sm">{channel.followers.toLocaleString("pt-BR")} seguidores</p>
                <p className="text-right text-sm">{channel.publications.toLocaleString("pt-BR")} publicações</p>
              </div>
              <img src={channel.avatar} alt={`Avatar de ${channel.name}`} className="h-24 w-24 rounded-full object-cover" />
            </div>
          </div>
        </section>

        <nav className="mt-1 flex min-w-0 items-center border-b border-white/15" aria-label="Seções do canal">
          <a href="#inicio" onClick={() => setSelectedSection("tudo")} aria-current={selectedSection === "tudo" ? "location" : undefined} className={`${tabClass("tudo")} whitespace-nowrap px-3 py-2 sm:px-8`}>Tudo</a>
          
          <div className={tabClass("publicacoes")}>
            <a href="#publicacoes" onClick={() => setSelectedSection("publicacoes")} aria-current={selectedSection === "publicacoes" ? "location" : undefined} className="whitespace-nowrap px-3 py-2 sm:px-5">
              Publicações
              </a>
            {isOwnChannel && 
              <Link href="/publicacao" className="px-3 py-2 text-xl leading-none hover:bg-gold hover:text-navy" aria-label="Criar publicação" title="Criar publicação">
                +
              </Link>
            }
          </div>
          
          <div className={tabClass("catalogos")}>
            <a href="#catalogos" onClick={() => setSelectedSection("catalogos")} aria-current={selectedSection === "catalogos" ? "location" : undefined} className="whitespace-nowrap px-3 py-2 sm:px-5">
              Catálogos
            </a>
            {isOwnChannel && 
            <Link href="/publicacao_catalogo" className="px-3 py-2 text-xl leading-none hover:bg-gold hover:text-navy" aria-label="Criar catálogo" title="Criar catálogo">
                +
              </Link>
            }
          </div>

          <input className="ml-1 hidden flex-1 bg-transparent px-3 text-xs placeholder:text-cream/60 sm:block" placeholder="PESQUISAR" aria-label="Pesquisar no canal" />
        </nav>

        <div id={selectedSection === "tudo" ? "inicio" : selectedSection}>
          {isOwnChannel
            ? ownedContent?.uid !== channelId
              ? <p className="py-8 text-center text-sm text-cream/70">Carregando publicações e catálogos...</p>
              : filteredItems.length > 0
                ? <section className="grid grid-cols-2 gap-4 py-2 md:grid-cols-3 lg:grid-cols-4" aria-label={`${selectedSection === "publicacoes" ? "Publicações" : selectedSection === "catalogos" ? "Catálogos" : "Publicações e catálogos"} de ${channel.name}`}>
                  {filteredItems.map((item) => <MediaCard
                    key={`${item.tipo}-${item.id}`}
                    title={item.titulo}
                    image={item.miniatura}
                    meta={item.descricao}
                    duration={item.duracao}
                    href={item.href}
                    monetizations={item.monetizacoes}
                    isCatalog={item.tipo === "catalogo"}
                    channel={{ channelId: channel.id, name: channel.name, title: channel.title, avatar: channel.avatar }}
                  />)}
                </section>
                : <p className="py-12 text-center text-sm text-cream/70">
                  {selectedSection === "publicacoes" ? "Nenhuma publicação por enquanto." : selectedSection === "catalogos" ? "Nenhum catálogo por enquanto." : "Nenhum conteúdo por enquanto."}
                </p>
            : selectedSection !== "catalogos" && channel.videos.length > 0
              ? <section className="grid grid-cols-2 gap-4 py-2 md:grid-cols-3 lg:grid-cols-4" aria-label={`Publicações de ${channel.name}`}>
                {channel.videos.map((video) => <MediaCard key={video.title} {...video} channel={{ channelId: channel.id, name: channel.name, title: channel.title, avatar: channel.avatar }} />)}
              </section>
              : <p className="py-12 text-center text-sm text-cream/70">{selectedSection === "catalogos" ? "Nenhum catálogo por enquanto." : "Nenhuma publicação por enquanto."}</p>}
        </div>
      </main>
    </div>
  );
}