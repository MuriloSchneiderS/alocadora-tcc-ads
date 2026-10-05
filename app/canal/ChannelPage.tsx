"use client";

import { onAuthStateChanged, User } from "firebase/auth";
import Link from "next/link";
import { useEffect, useState } from "react";

import { auth } from "../../lib/firebase";
import { MOCK_CHANNELS } from "../../lib/mock-channels";
import Header from "../components/Header";
import MediaCard from "../components/MediaCard";

type ChannelPageProps = {
  channelId: string;
};

export default function ChannelPage({ channelId }: ChannelPageProps) {
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
    setAuthResolved(true);
  }), []);

  if (!authResolved)
    return <main className="flex min-h-screen items-center justify-center bg-ink text-sm text-cream">Carregando canal...</main>;

  const isOwnChannel = Boolean(user && user.uid === channelId);
  const mockChannel = MOCK_CHANNELS[channelId];
  const channel = isOwnChannel && user
    ? {
      id: user.uid,
      name: user.displayName || user.email?.split("@")[0] || "Meu canal",
      title: "Canal do usuário",
      avatar: user.photoURL || "https://i.pravatar.cc/160?img=68",
      description: "Este é o seu canal. Suas publicações aparecerão aqui.",
      followers: 0,
      publications: 0,
      videos: [],
    }
    : mockChannel;

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
            <div className="flex items-center gap-4 lg:min-w-96 lg:justify-end">
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

        <nav className="mt-1 flex border-b border-white/15" aria-label="Seções do canal">
          <a href="#inicio" className="bg-cream px-10 py-2 text-lg text-ink">Início</a>
          <a href="#publicacoes" className="border-r border-white/15 px-5 py-2 text-lg hover:bg-panel">Publicações</a>
          <a href="#catalogos" className="border-r border-white/15 px-5 py-2 text-lg hover:bg-panel">Catálogos</a>
          <input className="ml-1 hidden flex-1 bg-transparent px-3 text-xs placeholder:text-cream/60 sm:block" placeholder="PESQUISAR" aria-label="Pesquisar no canal" />
        </nav>

        {channel.videos.length > 0
          ? <section id="publicacoes" className="grid grid-cols-2 gap-4 py-2 md:grid-cols-3 lg:grid-cols-4" aria-label={`Publicações de ${channel.name}`}>
            {channel.videos.map((video) => <MediaCard key={video.title} {...video} channel={{ channelId: channel.id, name: channel.name, title: channel.title, avatar: channel.avatar }} />)}
          </section>
          : <p id="publicacoes" className="py-12 text-center text-sm text-cream/70">Nenhuma publicação por enquanto.</p>}
      </main>
    </div>
  );
}