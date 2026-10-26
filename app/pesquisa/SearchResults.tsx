"use client";

import Link from "next/link";
import { useState } from "react";
import type { SearchChannelItem, SearchMediaItem, SearchItem } from "../../lib/content-search";
import usePagedContent from "../hooks/usePagedContent";
import Header from "../components/Header";
import MediaCard from "../components/MediaCard";

type SearchFilter = "tudo" | "publicacoes" | "catalogos" | "canais";

const filters: { id: SearchFilter; label: string }[] = [
  { id: "tudo", label: "Tudo" },
  { id: "publicacoes", label: "Publicações" },
  { id: "catalogos", label: "Catálogos" },
  { id: "canais", label: "Canais" },
];

function isMediaItem(item: SearchItem): item is SearchMediaItem {
  return item.type === "publication" || item.type === "catalog";
}
function isChannelItem(item: SearchItem): item is SearchChannelItem {
  return item.type === "channel";
}

//verifica se o item corresponde ao filtro selecionado
function matchesFilter(item: SearchItem, filter: SearchFilter) {
  if (filter === "tudo") return true;
  if (filter === "publicacoes") return item.type === "publication";
  if (filter === "catalogos") return item.type === "catalog";
  return item.type === "channel";
}

export default function SearchResults({ initialQuery }: { initialQuery: string }) {
  const [filter, setFilter] = useState<SearchFilter>("tudo");
  //chama o hook usePagedContent para buscar os resultados da pesquisa com base na query inicial e no filtro selecionado
  const { items, isLoading, isLoadingMore, error, hasMore, loadMore } = usePagedContent({
    query: initialQuery,
    enabled: Boolean(initialQuery.trim()),
  });
  const visibleItems = items.filter((item) => matchesFilter(item, filter));

  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto max-w-[1800px] px-3 py-5 sm:px-5">
        <h1 className="mb-4 text-2xl font-bold text-white">
          {initialQuery ? `Resultados para "${initialQuery}"` : "Pesquisar"}
        </h1>
        <nav className="mb-5 flex overflow-x-auto border-b border-white/15" aria-label="Filtros da pesquisa">
          {filters.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`shrink-0 border-r border-white/15 px-4 py-2 text-sm sm:px-6 ${filter === id ? "bg-cream text-ink" : "text-cream hover:bg-panel"}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {isLoading ? <p className="py-12 text-center text-sm text-cream/70" role="status">Pesquisando...</p>
          : error && items.length === 0 ? <p className="py-12 text-center text-sm text-red" role="alert">Não foi possível carregar os resultados. {error}</p>
            : visibleItems.length > 0 ? <section className="grid gap-4 py-2 md:grid-cols-3 lg:grid-cols-4" aria-label="Resultados da pesquisa">
                {visibleItems.filter(isMediaItem).map((item) => <MediaCard
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
                {visibleItems.filter(isChannelItem).map((item) => <article key={`channel-${item.id}`} className="border border-white/10 bg-panel p-4">
                  <Link href={item.href} className="flex items-center gap-3">
                    <img src={item.avatar} alt="" className="h-16 w-16 rounded-full object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-white">{item.name}</span>
                      <span className="block truncate text-sm text-cream/75">{item.title}</span>
                    </span>
                  </Link>
                  {item.description && <p className="mt-3 line-clamp-3 text-xs text-cream/65">{item.description}</p>}
                </article>)}
              </section>
              : <p className="py-12 text-center text-sm text-cream/70">
                {initialQuery ? `Nenhum resultado encontrado para o filtro "${filters.find(({ id }) => id === filter)?.label}".` : "Digite um termo na barra de pesquisa para encontrar publicações, catálogos e canais."}
              </p>}

        {error && items.length > 0 && <p className="mt-4 text-center text-sm text-red" role="alert">{error}</p>}

        {/* Botão de carregar mais resultados */}
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
