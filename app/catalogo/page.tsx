'use client';

import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import Header from "../components/Header";
import MediaCard from "../components/MediaCard";
import { useAuth } from "../providers";
import { DEFAULT_CHANNEL_TITLE, DEFAULT_USER_AVATAR } from "../../lib/user-profile";

type Catalog = {
  id: string;
  titulo: string;
  descricao: string;
  miniatura: string;
  publicacoes: string[];
  monetizacoes: { tipo: string; preco: number; duracao?: number }[];
  creatorName: string;
  creatorTitle: string;
  creatorAvatar: string;
};

function formatMonetization(item: Catalog["monetizacoes"][number]) {
  if (item.tipo === "gratuito") return "gratuito";
  const price = `R$${(item.preco / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  if (item.tipo === "aluguel" && item.duracao === 7) return `${price}/semana`;
  if (item.tipo === "assinatura" && item.duracao === 30) return `${price}/mês`;
  return price;
}

export default function Catalogo() {
  const { user, isLoading } = useAuth();
  const [loadedCatalogs, setLoadedCatalogs] = useState<{ uid: string; catalogs: Catalog[] } | null>(null);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const displayName = user.displayName;
    const photoURL = user.photoURL;
    let isCurrent = true;

    async function loadCatalogs() {
      try {
        const [snapshots, profileSnapshot] = await Promise.all([
          getDocs(query(collection(db, "catalogo"), where("criador", "==", uid))),
          getDoc(doc(db, "usuario", uid)),
        ]);
        const profile = profileSnapshot.data();
        const result = await Promise.all(snapshots.docs.map(async (snapshot) => {
          const data = snapshot.data();
          const monetizations = await getDocs(collection(db, "catalogo", snapshot.id, "monetizacao"));
          return {
            id: snapshot.id,
            titulo: String(data.titulo ?? "Sem título"),
            descricao: String(data.descricao ?? ""),
            miniatura: String(data.miniatura || "/assets/catalogo_vazio.png"),
            publicacoes: Array.isArray(data.publicacoes) ? data.publicacoes as string[] : [],
            monetizacoes: monetizations.docs.map((item) => item.data() as Catalog["monetizacoes"][number]),
            creatorName: String(profile?.nome ?? displayName ?? "Meu canal"),
            creatorTitle: String(profile?.titulo || DEFAULT_CHANNEL_TITLE),
            creatorAvatar: String(profile?.avatar || photoURL || DEFAULT_USER_AVATAR),
          };
        }));
        if (isCurrent) setLoadedCatalogs({ uid, catalogs: result });
      } catch {
        if (isCurrent) setLoadedCatalogs({ uid, catalogs: [] });
      }
    }

    void loadCatalogs();
    return () => { isCurrent = false; };
  }, [user]);

  const catalogs = loadedCatalogs && loadedCatalogs.uid === user?.uid ? loadedCatalogs.catalogs : null;

  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto max-w-[1800px] px-3 py-5 sm:px-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-3">
          <h1 className="text-xl font-bold text-white">Meus catálogos</h1>
          {user && <Link href="/publicacao_catalogo" className="bg-panel-muted px-4 py-2 text-sm text-white hover:bg-gold hover:text-navy">Criar catálogo</Link>}
        </div>
        {isLoading
          ? <p className="py-10 text-center text-sm text-cream/70">Verificando sessão...</p>
          : !user
            ? <p className="py-10 text-center text-sm text-cream/70"><Link href="/login" className="underline">Entre</Link> para ver seus catálogos.</p>
            : !catalogs
              ? <p className="py-10 text-center text-sm text-cream/70">Carregando catálogos...</p>
              : catalogs.length === 0
              ? <p className="py-10 text-center text-sm text-cream/70">Você ainda não criou nenhum catálogo.</p>
              : <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-4" aria-label="Seus catálogos">
                {catalogs.map((catalog) => <MediaCard
                  key={catalog.id}
                  title={catalog.titulo}
                  image={catalog.miniatura}
                  meta={catalog.descricao}
                  duration={`${catalog.publicacoes.length} itens`}
                  href={`/catalogo/${catalog.id}`}
                  monetizations={catalog.monetizacoes.map(formatMonetization)}
                  isCatalog
                  channel={{ channelId: user.uid, name: catalog.creatorName, title: catalog.creatorTitle, avatar: catalog.creatorAvatar }}
                />)}
              </section>}
      </main>
    </div>
  );
}