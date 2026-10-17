"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchItem, SearchPage } from "../../lib/content-search";

type UsePagedContentOptions = {
  query?: string;
  channelId?: string;
  enabled?: boolean;
};

type ContentState = {
  key: string;
  items: SearchItem[];
  nextCursor: string | null;
  error: string;
  isLoadingMore: boolean;
};

//Limitado a 1000 resultados para evitar problemas de performance e consumo de memória
export default function usePagedContent({ query = "", channelId = "", enabled = true }: UsePagedContentOptions = {}) {
  const key = `${channelId}\u0000${query.trim()}`;//u0000 é um caractere nulo, usado para separar o channelId do query
  const [contentState, setContentState] = useState<ContentState>({
    key: "",
    items: [],
    nextCursor: null,
    error: "",
    isLoadingMore: false,
  });
  const requestGeneration = useRef(0);
  const loadingMore = useRef(false);

  //requisição da página de resultados
  const requestPage = useCallback(async (cursor: string | null, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (channelId) params.set("channelId", channelId);
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`/api/search?${params.toString()}`, { signal, cache: "no-store" });
    const result = await response.json() as SearchPage | { error?: string };
    if (!response.ok)
      throw new Error("error" in result && result.error ? result.error : "Não foi possível carregar os resultados.");
    if (!("items" in result) || !Array.isArray(result.items))
      throw new Error("A resposta da pesquisa é inválida.");
    return result;
  }, [channelId, query]);

  //Sempre que o key (channelId + query) mudar, reinicia a pesquisa
  useEffect(() => {
    const generation = ++requestGeneration.current;
    const controller = new AbortController();
    loadingMore.current = false;

    if (!enabled) return () => controller.abort();

    void requestPage(null, controller.signal)
      .then((page) => {
        if (requestGeneration.current !== generation) return;
        setContentState({
          key,
          items: page.items,
          nextCursor: page.nextCursor,
          error: "",
          isLoadingMore: false,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || requestGeneration.current !== generation) return;
        setContentState({
          key,
          items: [],
          nextCursor: null,
          error: caught instanceof Error ? caught.message : "Não foi possível carregar os resultados.",
          isLoadingMore: false,
        });
      });

    return () => controller.abort();
  }, [enabled, key, requestPage]);

  //Carrega mais resultados quando o usuário solicita
  const loadMore = useCallback(async () => {
    const currentState = contentState;
    const cursor = currentState.key === key ? currentState.nextCursor : null;
    if (!cursor || loadingMore.current) return;
    const generation = requestGeneration.current;

    loadingMore.current = true;
    setContentState((current) => current.key === key
      ? { ...current, isLoadingMore: true, error: "" }
      : current);
    try {
      const page = await requestPage(cursor);
      if (requestGeneration.current !== generation) return;
      setContentState((current) => {
        if (current.key !== key) return current;
        const existing = new Set(current.items.map((item) => `${item.type}:${item.id}`));
        return {
          ...current,
          items: [...current.items, ...page.items.filter((item) => !existing.has(`${item.type}:${item.id}`))],
          nextCursor: page.nextCursor,
        };
      });
    } catch (caught) {
      if (requestGeneration.current === generation) {
        setContentState((current) => current.key === key
          ? { ...current, error: caught instanceof Error ? caught.message : "Não foi possível carregar mais resultados." }
          : current);
      }
    } finally {
      if (requestGeneration.current === generation) {
        loadingMore.current = false;
        setContentState((current) => current.key === key ? { ...current, isLoadingMore: false } : current);
      }
    }
  }, [contentState, key, requestPage]);

  const isCurrent = enabled && contentState.key === key;
  return {
    items: isCurrent ? contentState.items : [],
    isLoading: enabled && !isCurrent,
    isLoadingMore: isCurrent && contentState.isLoadingMore,
    error: isCurrent ? contentState.error : "",
    hasMore: isCurrent && Boolean(contentState.nextCursor),
    loadMore,
  };
}
