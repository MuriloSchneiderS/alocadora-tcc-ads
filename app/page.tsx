"use client";

import { collection, doc, getDoc, getDocs, Timestamp } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";

import { db } from "../lib/firebase";
import { DEFAULT_CHANNEL_TITLE, DEFAULT_USER_AVATAR } from "../lib/user-profile";
import AcquisitionOptions from "./components/AcquisitionOptions";
import ChannelInfo from "./components/ChannelInfo";
import Header from "./components/Header";
import MediaCard from "./components/MediaCard";

type Monetization = {
  tipo: string;
  preco?: number;
  duracao?: number;
};

type HomeItem = {
  id: string;
  type: "publication" | "catalog";
  createdAt: number;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  href: string;
  monetizations: string[];
  acquisitions: { label: string; price: string }[];
  channel: {
    channelId: string;
    name: string;
    title: string;
    avatar: string;
  };
};

type RawHomeItem = {
  id: string;
  type: HomeItem["type"];
  data: Record<string, unknown>;
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
  if (item.tipo === "gratuito") return { label: "Acesso gratuito", price: "Grátis" };

  const price = `R$${(Number(item.preco ?? 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  if (item.tipo === "aluguel") return { label: `Alugue por ${item.duracao ?? 7} dias`, price };
  if (item.tipo === "assinatura") return { label: "Assine", price };
  return { label: "Compre", price };
}

function monetizationName(type: string) {
  if (type === "gratuito") return "Gratuito";
  if (type === "aluguel") return "Aluguel";
  if (type === "assinatura") return "Assinatura";
  return "Compra";
}

export default function Home() {
  const [items, setItems] = useState<HomeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    async function loadHomeItems() {
      try {
        const [publicationSnapshots, catalogSnapshots] = await Promise.all([
          getDocs(collection(db, "publicacao")),
          getDocs(collection(db, "catalogo")),
        ]);
        const rawItems: RawHomeItem[] = [
          ...publicationSnapshots.docs.map((snapshot) => ({
            id: snapshot.id,
            type: "publication" as const,
            data: snapshot.data(),
          })),
          ...catalogSnapshots.docs.map((snapshot) => ({
            id: snapshot.id,
            type: "catalog" as const,
            data: snapshot.data(),
          })),
        ];

        const creatorIds = [...new Set(rawItems
          .map(({ data }) => String(data.criador ?? ""))
          .filter(Boolean))];
        const profiles = new Map<string, Record<string, unknown>>();
        await Promise.all(creatorIds.map(async (creatorId) => {
          const snapshot = await getDoc(doc(db, "usuario", creatorId));
          if (snapshot.exists()) profiles.set(creatorId, snapshot.data());
        }));

        const loadedItems = await Promise.all(rawItems.map(async ({ id, type, data }) => {
          const creatorId = String(data.criador ?? "");
          const monetizationSnapshot = await getDocs(collection(db, type === "publication" ? "publicacao" : "catalogo", id, "monetizacao"));
          const monetizations = monetizationSnapshot.docs.map((snapshot) => snapshot.data() as Monetization);
          const profile = profiles.get(creatorId);
          const publications = Array.isArray(data.publicacoes) ? data.publicacoes : [];
          const duration = Number(data.duracao ?? 0);

          return {
            id,
            type,
            createdAt: timestampToMillis(data.data_criacao),
            title: String(data.titulo ?? "Sem título"),
            description: String(data.descricao ?? ""),
            thumbnail: String(data.miniatura || "/assets/catalogo_vazio.png"),
            duration: type === "publication" ? formatDuration(duration) : `${publications.length} itens`,
            href: type === "publication" ? `/exibicao?publicationId=${encodeURIComponent(id)}` : `/catalogo/${encodeURIComponent(id)}`,
            monetizations: monetizations.map(({ tipo }) => monetizationName(tipo)),
            acquisitions: monetizations.map(formatMonetization),
            channel: {
              channelId: creatorId,
              name: String(profile?.nome ?? "Criador"),
              title: String(profile?.titulo || DEFAULT_CHANNEL_TITLE),
              avatar: String(profile?.avatar || DEFAULT_USER_AVATAR),
            },
          } satisfies HomeItem;
        }));

        loadedItems.sort((first, second) =>
          second.createdAt - first.createdAt || first.id.localeCompare(second.id),
        );
        if (isCurrent) {
          setItems(loadedItems);
          setError("");
        }
      } catch (caught) {
        if (isCurrent) {
          setError(caught instanceof Error ? caught.message : "Não foi possível carregar as publicações e catálogos.");
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadHomeItems();
    return () => { isCurrent = false; };
  }, []);

  const latestPublication = items.find((item) => item.type === "publication");
  const feedItems = items.filter((item) =>
    item.type !== "publication" || item.id !== latestPublication?.id,
  );

  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto max-w-[1800px] px-3 py-3 sm:px-5">
        {latestPublication && <section className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]" aria-label="Publicação mais recente">
          <Link href={latestPublication.href} aria-label={`Abrir publicação: ${latestPublication.title}`} className="block min-h-72 overflow-hidden bg-panel-muted lg:h-[340px]">
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
          {isLoading
            ? <p className="py-8 text-center text-sm text-cream/70" role="status">Carregando publicações e catálogos...</p>
            : error
              ? <p className="py-8 text-center text-sm text-red" role="alert">{error}</p>
              : feedItems.length > 0
                ? <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
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
                : <p className="py-12 text-center text-sm text-cream/70">Nenhuma publicação ou catálogo por enquanto.</p>}
        </section>
      </main>
    </div>
  );
}
