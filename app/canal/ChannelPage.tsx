"use client";

import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { FormEvent, useEffect, useState } from "react";

import { db } from "../../lib/firebase";
import { DEFAULT_CHANNEL_TITLE, DEFAULT_USER_AVATAR, type UserProfile } from "../../lib/user-profile";
import type { SearchMediaItem } from "../../lib/content-search";
import usePagedContent from "../hooks/usePagedContent";
import Header from "../components/Header";
import MediaCard from "../components/MediaCard";
import { useAuth } from "../providers";

type ChannelPageProps = {
  channelId: string;
};

type ChannelResult = {
  id: string;
  profile: UserProfile | null;
  error?: string;
};

export default function ChannelPage({ channelId }: ChannelPageProps) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [channelResult, setChannelResult] = useState<ChannelResult | null>(null);
  const [selectedSection, setSelectedSection] = useState<"tudo" | "publicacoes" | "catalogos">("tudo");
  const [searchInput, setSearchInput] = useState("");
  const [channelSearch, setChannelSearch] = useState("");
  const isOwnChannel = Boolean(user && user.uid === channelId);
  const {
    items,
    isLoading: isContentLoading,
    isLoadingMore,
    error: contentError,
    hasMore,
    loadMore,
  } = usePagedContent({ query: channelSearch, channelId });

  useEffect(() => {
    if (isAuthLoading) return;

    let isCurrent = true;

    async function loadChannel() {
      try {
        const profileSnapshot = await getDoc(doc(db, "usuario", channelId));
        if (!profileSnapshot.exists() && !isOwnChannel) {
          if (isCurrent) setChannelResult({ id: channelId, profile: null });
          return;
        }

        const profileData = profileSnapshot.data();
        const profile: UserProfile = {
          nome: String(profileData?.nome || (isOwnChannel ? user?.displayName : "") || "Criador"),
          titulo: String(profileData?.titulo || DEFAULT_CHANNEL_TITLE),
          descricao: String(profileData?.descricao ?? ""),
          avatar: String(profileData?.avatar || (isOwnChannel ? user?.photoURL : "") || DEFAULT_USER_AVATAR),
        };

        if (isCurrent) setChannelResult({ id: channelId, profile });
      } catch (caught) {
        if (isCurrent) {
          setChannelResult({
            id: channelId,
            profile: null,
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
  const channelProfile = currentChannelResult?.profile ?? null;
  const isLoading = isAuthLoading || currentChannelResult === null;
  const error = currentChannelResult?.error ?? "";
  const channelItems = items.filter((item): item is SearchMediaItem => item.type !== "channel");
  const filteredItems = channelItems.filter((item) =>
    selectedSection === "tudo"
      || (selectedSection === "publicacoes" ? item.type === "publication" : item.type === "catalog"),
  );

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChannelSearch(searchInput.trim());
  }

  if (isAuthLoading || isLoading)
    return <main className="flex min-h-screen items-center justify-center bg-ink text-sm text-cream">Carregando canal...</main>;

  if (!channelProfile) {
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
            <p className="max-w-3xl whitespace-pre-line text-sm leading-tight text-cream/85">{channelProfile.descricao}</p>
            <div className="flex items-center gap-4 lg:min-w-96 lg:justify-end">
              <div className="text-right">
                <h1 className="text-3xl text-white">{channelProfile.nome}</h1>
                <p className="text-2xl text-cream/90">{channelProfile.titulo}</p>
                {isOwnChannel
                  ? <Link href="/painel_controle" className="mt-2 block w-full border border-gold/30 bg-panel-muted px-5 py-2 text-sm font-bold text-white hover:bg-gold hover:text-navy">PAINEL DE CONTROLE</Link>
                  : <button type="button" className="mt-2 w-full border border-gold/30 bg-panel-muted px-8 py-1 text-xl text-white hover:bg-gold hover:text-navy">Seguir</button>}
              </div>
              <img src={channelProfile.avatar} alt={`Avatar de ${channelProfile.nome}`} className="h-24 w-24 rounded-full object-cover" />
            </div>
          </div>
        </section>

        <nav className="mt-1 flex min-w-0 items-center border-b border-white/15" aria-label="Seções do canal">
          <button type="button" onClick={() => setSelectedSection("tudo")} aria-pressed={selectedSection === "tudo"} className={`${tabClass("tudo")} whitespace-nowrap px-3 py-2 sm:px-8`}>Tudo</button>
          <div className={tabClass("publicacoes")}>
            <button type="button" onClick={() => setSelectedSection("publicacoes")} aria-pressed={selectedSection === "publicacoes"} className="whitespace-nowrap px-3 py-2 sm:px-5">Publicações</button>
            {isOwnChannel && <Link href="/publicacao" className="px-3 py-2 text-xl leading-none hover:bg-gold hover:text-navy" aria-label="Criar publicação" title="Criar publicação">+</Link>}
          </div>
          <div className={tabClass("catalogos")}>
            <button type="button" onClick={() => setSelectedSection("catalogos")} aria-pressed={selectedSection === "catalogos"} className="whitespace-nowrap px-3 py-2 sm:px-5">Catálogos</button>
            {isOwnChannel && <Link href="/publicacao_catalogo" className="px-3 py-2 text-xl leading-none hover:bg-gold hover:text-navy" aria-label="Criar catálogo" title="Criar catálogo">+</Link>}
          </div>
          <form onSubmit={handleSearch} role="search" className="ml-2 flex min-w-0 flex-1">
            <label htmlFor="channel-content-search" className="sr-only">Pesquisar publicações e catálogos deste canal</label>
            <input id="channel-content-search" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs placeholder:text-cream/60" placeholder="PESQUISAR NESTE CANAL" />
            <button type="submit" className="bg-panel px-3 text-sm text-white hover:bg-cream hover:text-ink" aria-label="Pesquisar neste canal">⌕</button>
          </form>
        </nav>

        <div id={selectedSection === "tudo" ? "inicio" : selectedSection}>
          {isContentLoading
            ? <p className="py-8 text-center text-sm text-cream/70" role="status">Carregando publicações e catálogos...</p>
            : filteredItems.length > 0
              ? <section className="grid gap-4 py-2 md:grid-cols-3 lg:grid-cols-4" aria-label={`${selectedSection === "publicacoes" ? "Publicações" : selectedSection === "catalogos" ? "Catálogos" : "Publicações e catálogos"} de ${channelProfile.nome}`}>
                {filteredItems.map((item) => <MediaCard
                  key={`${item.type}-${item.id}`}
                  title={item.title}
                  image={item.thumbnail}
                  meta={item.description}
                  duration={item.duration}
                  href={item.href}
                  monetizations={item.monetizations}
                  isCatalog={item.type === "catalog"}
                  channel={item.channel}
                  acquisitions={item.acquisitions}
                />)}
              </section>
              : <p className="py-12 text-center text-sm text-cream/70">
                {channelSearch ? "Nenhum resultado encontrado para esta pesquisa." : selectedSection === "publicacoes" ? "Nenhuma publicação por enquanto." : selectedSection === "catalogos" ? "Nenhum catálogo por enquanto." : "Nenhum conteúdo por enquanto."}
              </p>}
        </div>

        {contentError && <p className="mt-4 text-center text-sm text-red" role="alert">Não foi possível carregar o conteúdo. {contentError}</p>}
        {hasMore && <div className="py-6 text-center">
          <button type="button" onClick={() => void loadMore()} disabled={isLoadingMore}
            className="border border-white/20 bg-panel px-6 py-3 text-sm font-bold text-white hover:bg-cream hover:text-ink disabled:opacity-50">
            {isLoadingMore ? "Carregando..." : "Carregar mais"}
          </button>
        </div>}
      </main>
    </div>
  );
}
