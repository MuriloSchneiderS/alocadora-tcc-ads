export type ChannelVideo = {
  title: string;
  image: string;
  meta: string;
};

export type MockChannel = {
  id: string;
  name: string;
  title: string;
  avatar: string;
  description: string;
  followers: number;
  publications: number;
  videos: ChannelVideo[];
};

export const MOCK_CHANNELS: Record<string, MockChannel> = {
  "semper-soma": {
    id: "semper-soma",
    name: "Semper Soma",
    title: "Banda",
    avatar: "https://i.pravatar.cc/160?img=13",
    description: "Semper Soma é uma banda formada em meados de 2016 em Araras, interior de São Paulo.\nA proposta do projeto é fazer música sincera e sem rótulos, visando somar vários ritmos e influências nas canções.\nCom um álbum, três EP's e diversos singles na bagagem, a banda trabalha agora em Gruvi & Melancolia.",
    followers: 899,
    publications: 53,
    videos: [
      { title: "Gruvi & Melancolia: O Documentário", image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80", meta: "6 partes" },
      { title: "Gruvi & Melancolia", image: "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=600&q=80", meta: "18 áudios" },
      { title: "Semper Soma - Gruvi & Melancolia", image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=600&q=80", meta: "1:01" },
      { title: "Semper Soma - Ser renascer", image: "https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=600&q=80", meta: "4:07" },
      { title: "Semper Soma - Sobre nós", image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=600&q=80", meta: "4:26" },
      { title: "Semper Soma - Cidade em Verso", image: "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=600&q=80", meta: "2:58" },
      { title: "Chame como quiser", image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=600&q=80", meta: "9 áudios" },
      { title: "Semper Soma - Cidade em Verso (Clipe)", image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80", meta: "3:21" },
    ],
  },
  "alberto-mielgo": {
    id: "alberto-mielgo",
    name: "Alberto Mielgo",
    title: "Diretor e animador",
    avatar: "https://i.pravatar.cc/160?img=12",
    description: "Direção, animação e narrativas visuais independentes.",
    followers: 12400,
    publications: 18,
    videos: [{ title: "OSCAR WINNER 2022 Best Animated Short 4K", image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=600&q=80", meta: "Curta-metragem" }],
  },
  "arkwad-strugatsky": {
    id: "arkwad-strugatsky",
    name: "Arkwad Strugatsky",
    title: "Criador de conteúdo",
    avatar: "https://i.pravatar.cc/160?img=22",
    description: "Histórias e registros de viagens por lugares inesperados.",
    followers: 2860,
    publications: 12,
    videos: [{ title: "Piquenique na estrada", image: "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=600&q=80", meta: "Documentário" }],
  },
  markiplier: {
    id: "markiplier",
    name: "Markiplier",
    title: "Ator e influenciador",
    avatar: "https://i.pravatar.cc/160?img=47",
    description: "Filmes, jogos e projetos independentes.",
    followers: 35400000,
    publications: 126,
    videos: [{ title: "Iron Lung - Oceano de sangue", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80", meta: "Longa-metragem" }],
  },
  glitch: {
    id: "glitch",
    name: "Glitch",
    title: "Estúdio de animação",
    avatar: "https://i.pravatar.cc/160?img=31",
    description: "Animação independente e mundos originais.",
    followers: 218000,
    publications: 34,
    videos: [{ title: "O incrível circo digital", image: "https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=600&q=80", meta: "Série" }],
  },
  "letras-gerais": {
    id: "letras-gerais",
    name: "Letras Gerais",
    title: "Vídeo ensaio",
    avatar: "https://i.pravatar.cc/160?img=8",
    description: "Leituras, ideias e conversas sobre livros.",
    followers: 940,
    publications: 9,
    videos: [{ title: "Por que todo mundo acha que 1984 concorda com eles?", image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80", meta: "Vídeo ensaio" }],
  },
  "video-ensaio": {
    id: "video-ensaio",
    name: "Vídeo ensaio",
    title: "Cinema e cultura",
    avatar: "https://i.pravatar.cc/96?img=36",
    description: "Ensaios audiovisuais sobre cinema e cultura.",
    followers: 1370,
    publications: 14,
    videos: [{ title: "You're Not Overthinking It", image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=600&q=80", meta: "Vídeo ensaio" }],
  },
};

export function getChannelPath(channelId: string) {
  return `/canal/${encodeURIComponent(channelId)}`;
}