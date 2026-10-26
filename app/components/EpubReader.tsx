'use client';

import { useEffect, useRef, useState } from "react";
import type { Rendition } from "epubjs";
import { useAuth } from "../providers";

export default function EpubReader({ publicationId, title }: { publicationId: string; title: string }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [status, setStatus] = useState("Carregando livro...");
  const [page, setPage] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === containerRef.current?.parentElement);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let destroyBook = () => {};
    const controller = new AbortController();

    async function loadBook() {
      if (isAuthLoading) return;
      if (!containerRef.current) return;

      try {
        const response = await fetch(`/api/content/epub?publicationId=${encodeURIComponent(publicationId)}`, {
          headers: user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {},
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`epub-http-${response.status}`);
        const data = await response.arrayBuffer();
        if (cancelled) return;

        const { default: ePub } = await import("epubjs");
        if (cancelled || !containerRef.current) return;

        const mobileLayout = window.matchMedia("(max-width: 767px)");
        const book = ePub(data);
        const rendition = book.renderTo(containerRef.current, {
          width: "100%",
          height: "100%",
          flow: mobileLayout.matches ? "scrolled-doc" : "paginated",
          spread: "none",
          resizeOnOrientationChange: true,
        });
        renditionRef.current = rendition;
        const updateFlow = (event: MediaQueryListEvent) => {
          rendition.flow(event.matches ? "scrolled-doc" : "paginated");
        };
        mobileLayout.addEventListener("change", updateFlow);
        destroyBook = () => {
          mobileLayout.removeEventListener("change", updateFlow);
          rendition.destroy();
          book.destroy();
        };
        rendition.on("relocated", (location: { start: { displayed: { page: number; total: number } } }) => {
          setPage(`${location.start.displayed.page} / ${location.start.displayed.total}`);
        });
        await book.ready;
        await rendition.display();
        if (!cancelled) {
          setIsReady(true);
          setStatus("");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("EPUB reader failed to load", error);
        if (!cancelled) setStatus("Não foi possível abrir este EPUB.");
      }
    }

    void loadBook();
    return () => {
      cancelled = true;
      controller.abort();
      renditionRef.current = null;
      destroyBook();
    };
  }, [isAuthLoading, publicationId, user]);

  async function turnPage(direction: "prev" | "next") {
    const rendition = renditionRef.current;
    if (!rendition) return;
    try {
      await rendition[direction]();
    } catch (error) {
      console.error("EPUB page navigation failed", error);
    }
  }

  async function toggleFullscreen() {
    const reader = containerRef.current?.parentElement;
    if (!reader) return;
    try {
      if (document.fullscreenElement === reader) await document.exitFullscreen();
      else await reader.requestFullscreen();
    } catch (error) {
      console.error("EPUB fullscreen toggle failed", error);
    }
  }

  return (
    <section className={`flex h-full min-h-48 flex-col bg-panel ${isFullscreen ? "h-[100dvh] w-screen" : ""}`} aria-label={`Leitor de ${title}`}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
        <button type="button" onClick={() => void turnPage("prev")} disabled={!isReady} aria-label="Página anterior" className="border border-cream/30 px-3 py-1 text-sm text-cream hover:border-gold hover:bg-gold hover:text-navy disabled:opacity-40">
          &lt;{/*<*/}
        </button>

        <span className="min-w-0 truncate text-xs text-cream/70" role="status">{page || status}</span>
        
        <div>
          <button type="button" onClick={() => void turnPage("next")} disabled={!isReady} aria-label="Próxima página" className="border border-cream/30 px-3 py-1 text-sm text-cream hover:border-gold hover:bg-gold hover:text-navy disabled:opacity-40">
            &gt;{/*>*/}
          </button>
          <button type="button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Sair da tela inteira" : "Abrir em tela inteira"} title={isFullscreen ? "Sair da tela inteira" : "Abrir em tela inteira"} className="shrink-0 border border-cream/30 px-2 py-1 text-xs text-cream hover:border-gold hover:bg-gold hover:text-navy">
            {isFullscreen ? "🗗" : "🗖"}
          </button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 bg-white" />
    </section>
  );
}