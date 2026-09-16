import Header from "./components/Header";
import MediaCard from "./components/MediaCard";
import ChannelInfo from "./components/ChannelInfo";
import AcquisitionOptions from "./components/AcquisitionOptions";

const recommendations = [
  { title: "OSCAR WINNER 2022 Best Animated Short 4K", image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=900&q=80", channel: { name: "Alberto Mielgo", title: "Diretor e animador", avatar: "https://i.pravatar.cc/96?img=12" }, acquisitions: [{ label: "Compre", price: "R$80" }] },
  { title: "Semper Soma - Gruvi & Melancolia", image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80", channel: { name: "Semper Soma", title: "Banda", avatar: "https://i.pravatar.cc/96?img=13" }, acquisitions: [{ label: "Compre", price: "R$13" }] },
  { title: "Cityscape painting", image: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=900&q=80", channel: { name: "Alberto Mielgo", title: "Artista visual", avatar: "https://i.pravatar.cc/96?img=12" }, acquisitions: [{ label: "Compre", price: "R$250" }] },
  { title: "Piquenique na estrada", image: "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=80", channel: { name: "Arkwad Strugatsky", title: "Criador de conteúdo", avatar: "https://i.pravatar.cc/96?img=22" }, acquisitions: [{ label: "Prévia", price: "Grátis" }] },
  { title: "Iron Lung - Oceano de sangue", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80", channel: { name: "Markiplier", title: "Ator e influenciador", avatar: "https://i.pravatar.cc/96?img=47" }, acquisitions: [{ label: "Alugue", price: "R$5" }] },
  { title: "O incrível circo digital", image: "https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=900&q=80", channel: { name: "Glitch", title: "Estúdio de animação", avatar: "https://i.pravatar.cc/96?img=31" }, acquisitions: [{ label: "Assine", price: "R$5/mês" }] },
  { title: "Por que todo mundo acha que 1984 concorda com eles?", image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=900&q=80", channel: { name: "Letras Gerais", title: "Vídeo ensaio", avatar: "https://i.pravatar.cc/96?img=8" }, acquisitions: [{ label: "Compre", price: "R$15" }] },
  { title: "You&apos;re Not Overthinking It", image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=80", channel: { name: "Vídeo ensaio", title: "Cinema e cultura", avatar: "https://i.pravatar.cc/96?img=36" }, acquisitions: [{ label: "Assine", price: "R$20/mês" }] },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto max-w-[1800px] px-3 py-3 sm:px-5">
        <section className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <img src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80" alt="Cena principal de Iron Lung" className="min-h-72 w-full object-cover lg:h-[340px]" />
          <div className="flex flex-col justify-between border border-white/10 bg-panel p-3">
            <div>
                <p className="site-accent text-sm font-medium uppercase">Novidade</p>
                <h1 className="text-3xl text-white">Iron Lung</h1>
                <p className="mt-2 text-xs leading-tight text-cream/80">Baseado no jogo homônimo, este filme de terror e ficção científica é focado na sobrevivência e no horror cósmico. Uma missão em um oceano de sangue.</p>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <AcquisitionOptions direction="inline" options={[{ label: "Compre", price: "R$50" }, { label: "Alugue por 7 dias", price: "R$5" }]} />
              <ChannelInfo name="Markiplier" title="Ator e influenciador" avatar="https://i.pravatar.cc/96?img=47" />
            </div>
          </div>
        </section>
        <div className="flex justify-end py-3"><label className="sr-only" htmlFor="home-filter">Filtrar publicações</label><select id="home-filter" className="border border-white/20 bg-ink px-3 py-2 text-xs text-cream"><option>Mais recentes</option><option>Mais populares</option><option>Mais avaliados</option></select></div>
        <section className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4" aria-label="Recomendações">{recommendations.map((video) => <MediaCard key={video.title} {...video} />)}</section>
      </main>
    </div>
  );
}
