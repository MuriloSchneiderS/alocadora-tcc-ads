"use client";

import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
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

export default function ChannelPage({ channelId }: ChannelPageProps) {
  const { user, isLoading } = useAuth();//hook que retorna o usuário logado e se está carregando
  const [loadedProfile, setLoadedProfile] = useState<{ uid: string; profile: UserProfile } | null>(null);//state para armazenar o perfil do usuário carregado do Firestore

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

  const userProfile = loadedProfile && loadedProfile.uid === user?.uid ? loadedProfile.profile : null;

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

        <nav className="mt-1 flex min-w-0 border-b border-white/15" aria-label="Seções do canal">
          <a href="#inicio" className="whitespace-nowrap bg-cream px-3 py-2 text-sm text-ink sm:px-10 sm:text-lg">Início</a>
          <a href="#publicacoes" className="whitespace-nowrap border-r border-white/15 px-3 py-2 text-sm hover:bg-panel sm:px-5 sm:text-lg">Publicações</a>
          <a href="#catalogos" className="whitespace-nowrap border-r border-white/15 px-3 py-2 text-sm hover:bg-panel sm:px-5 sm:text-lg">Catálogos</a>
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