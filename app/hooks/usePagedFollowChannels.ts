"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { SearchChannelItem } from "../../lib/content-search";
import { useAuth } from "../providers";

type FollowList = "followers" | "following";

type FollowPage = {
  items: SearchChannelItem[];
  total: number;
  nextCursor: string | null;
};

type FollowState = {
  key: string;
  items: SearchChannelItem[];
  total: number;
  nextCursor: string | null;
  error: string;
  isLoadingMore: boolean;
};

type UsePagedFollowChannelsOptions = {
  channelId: string;
  list: FollowList;
  enabled?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  //verifica se o valor é um objeto (não nulo e não um array)
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSearchChannelItem(value: unknown): value is SearchChannelItem {
  return isRecord(value)
    && value.type === "channel"
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.title === "string"
    && typeof value.description === "string"
    && typeof value.avatar === "string"
    && typeof value.href === "string";
}

//hook personalizado que busca os canais seguidos ou seguidores de um canal específico, com paginação
export default function usePagedFollowChannels({
  channelId,
  list,
  enabled = true,
}: UsePagedFollowChannelsOptions) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const key = `${user?.uid ?? ""}\u0000${channelId}\u0000${list}`;
  const [followState, setFollowState] = useState<FollowState>({
    key: "",
    items: [],
    total: 0,
    nextCursor: null,
    error: "",
    isLoadingMore: false,
  });
  const requestGeneration = useRef(0);
  const loadingMore = useRef(false);

  const requestPage = useCallback(async (cursor: string | null, signal?: AbortSignal): Promise<FollowPage> => {
    if (!user) throw new Error("Entre na sua conta para ver esta lista.");

    const token = await user.getIdToken();
    const params = new URLSearchParams({ list });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(
      `/api/channels/${encodeURIComponent(channelId)}/follow?${params.toString()}`,
      {
        signal,
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const result: unknown = await response.json();
    if (!response.ok) {
      const error = isRecord(result) && typeof result.error === "string"
        ? result.error
        : "Não foi possível carregar os canais.";
      throw new Error(error);
    }
    if (!isRecord(result) || !Array.isArray(result.items)
      || !result.items.every(isSearchChannelItem)
      || typeof result.total !== "number"
      || !(result.nextCursor === null || typeof result.nextCursor === "string"))
      throw new Error("A resposta da lista de canais é inválida.");
    return {
      items: result.items,
      total: result.total,
      nextCursor: result.nextCursor,
    };
  }, [channelId, list, user]);

  useEffect(() => {//faz a requisição da primeira página de canais quando o hook é usado, se estiver habilitado e o usuário estiver autenticado
    if (!enabled || isAuthLoading) return;

    const generation = ++requestGeneration.current;
    const controller = new AbortController();
    loadingMore.current = false;

    void requestPage(null, controller.signal)
      .then((page) => {
        if (requestGeneration.current !== generation) return;
        setFollowState({
          key,
          items: page.items,
          total: page.total,
          nextCursor: page.nextCursor,
          error: "",
          isLoadingMore: false,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || requestGeneration.current !== generation) return;
        setFollowState({
          key,
          items: [],
          total: 0,
          nextCursor: null,
          error: caught instanceof Error ? caught.message : "Não foi possível carregar os canais.",
          isLoadingMore: false,
        });
      });

    return () => controller.abort();
  }, [enabled, isAuthLoading, key, requestPage]);

  const loadMore = useCallback(async () => {
    const currentState = followState;
    const cursor = currentState.key === key ? currentState.nextCursor : null;
    if (!cursor || loadingMore.current) return;

    const generation = requestGeneration.current;
    loadingMore.current = true;
    setFollowState((current) => current.key === key
      ? { ...current, isLoadingMore: true, error: "" }
      : current);

    try {
      const page = await requestPage(cursor);
      if (requestGeneration.current !== generation) return;
      setFollowState((current) => {
        if (current.key !== key) return current;
        const existing = new Set(current.items.map((item) => item.id));
        return {
          ...current,
          items: [...current.items, ...page.items.filter((item) => !existing.has(item.id))],
          nextCursor: page.nextCursor,
        };
      });
    } catch (caught) {
      if (requestGeneration.current === generation) {
        setFollowState((current) => current.key === key
          ? {
            ...current,
            error: caught instanceof Error ? caught.message : "Não foi possível carregar mais canais.",
          }
          : current);
      }
    } finally {
      if (requestGeneration.current === generation) {
        loadingMore.current = false;
        setFollowState((current) => current.key === key ? { ...current, isLoadingMore: false } : current);
      }
    }
  }, [followState, key, requestPage]);

  const isCurrent = enabled && followState.key === key;
  return {
    items: isCurrent ? followState.items : [],
    total: isCurrent ? followState.total : 0,
    isLoading: enabled && (isAuthLoading || !isCurrent),
    isLoadingMore: isCurrent && followState.isLoadingMore,
    error: isCurrent ? followState.error : "",
    hasMore: isCurrent && Boolean(followState.nextCursor),
    loadMore,
  };
}
