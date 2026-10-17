"use client";

import Link from "next/link";

import AcquisitionOptions from "./components/AcquisitionOptions";
import ChannelInfo from "./components/ChannelInfo";
import Header from "./components/Header";
import MediaCard from "./components/MediaCard";
import usePagedContent from "./hooks/usePagedContent";
import type { SearchMediaItem } from "../lib/content-search";

export default function Home() {
  const { items, isLoading, isLoadingMore, error, hasMore, loadMore } = usePagedContent();
  const mediaItems = items.filter((item): item is SearchMediaItem => item.type !== "channel");
  const latestPublication = mediaItems.find((item) => item.type === "publication");
  const feedItems = mediaItems.filter((item) =>
    item.type !== "publication" || item.id !== latestPublication?.id,
  );

  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto max-w-[1800px] px-3 py-3 sm:px-5">
        {/* "NOVIDADE" Seção da publicação mais recente, será atualizada conforme a lógica de negócios */}
        {latestPublication && <section className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]" aria-label="Publicação mais recente">
          <Link href={latestPublication.href} aria-label={`Abrir publicação: ${latestPublication.title}`} className="block min-h-72 overflow-hidden bg-panel-muted lg:h-85">
            <img src={latestPublication.thumbnail} alt={latestPublication.title} className="h-full w-full object-cover" />
          </Link>
          <div className="flex flex-col justify-between border border-white/10 bg-panel p-3">
            <div>
              <p className="site-accent text-sm font-medium uppercase">Novidade</p>
              <h1 className="text-3xl text-white">
                <Link href={latestPublication.href} className="hover:text-gold">{latestPublication.title}</Link>
              </h1>
              <p className="mt-2 text-xs leading-tight text-cream/80">{latestPublication.description}</p>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              {latestPublication.acquisitions.length > 0 && <AcquisitionOptions direction="inline" options={latestPublication.acquisitions} />}
              <ChannelInfo {...latestPublication.channel} />
            </div>
          </div>
        </section>}

        <section className="mt-4" aria-label="Publicações e catálogos mais recentes">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-cream/80">Mais recentes</h2>
          {isLoading ? <p className="py-8 text-center text-sm text-cream/70" role="status">Carregando publicações e catálogos...</p>
            : error && items.length === 0 ? <p className="py-8 text-center text-sm text-red" role="alert">Não foi possível carregar publicações e catálogos. {error}</p>
              : feedItems.length > 0 ? <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
                  {feedItems.map((item) => <MediaCard
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
                </div>
                : !isLoading && <p className="py-12 text-center text-sm text-cream/70">Nenhuma publicação ou catálogo por enquanto.</p>}
        </section>

        {error && items.length > 0 && <p className="mt-4 text-center text-sm text-red" role="alert">{error}</p>}
        
        {/* Botão para carregar mais resultados */}
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
