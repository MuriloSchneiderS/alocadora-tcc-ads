import Header from "../components/Header";
import MediaCard from "../components/MediaCard";

const related = [
  ["Marathon - Official Cinematic Short Story Trailer", "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=600&q=80", "8:44"],
  ["Watch Dogs: Legion - Tipping Point Cinematic Trailer", "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80", "1:35"],
  ["Alberto Mielgo - Spider-Man: Into the Spider-Verse", "https://images.unsplash.com/photo-1534809027769-b00d750a6bac?auto=format&fit=crop&w=600&q=80", "1:20"],
  ["Love, Death + Robots | Netflix", "https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&w=600&q=80", "2:14"],
];

export default function Exibicao() {
  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto max-w-[1800px] px-3 py-3 sm:px-5">
        <section className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="relative aspect-video overflow-hidden bg-black">
            <img src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80" alt="Cena do vídeo The Windshield Wiper" className="h-full w-full object-cover" />
            <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 border-t border-cream pt-2 text-cream"><span>12:18 / 15:01</span><span className="text-3xl text-gold">▷</span><span className="ml-auto text-xl">♬ ⛶</span></div>
          </div>
          <aside className="bg-panel p-3">
            <img src="https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=900&q=80" alt="Miniatura de The Windshield Wiper" className="aspect-video w-full object-cover" />
            <h1 className="mt-2 text-xl font-semibold text-white">OSCAR WINNER 2022 Best Animated Short &quot;THE WINDSHIELD WIPER&quot; 4K</h1>
            <p className="mt-2 text-sm leading-tight text-cream/80">The Windshield Wiper. Short animated film by Alberto Mielgo. Designed and Directed by Alberto Mielgo and Leo Sanchez.</p>
            <div className="mt-6 flex items-center justify-between"><button type="button" className="bg-panel-muted px-5 py-2 text-xl hover:bg-gold hover:text-navy">Seguir</button><div className="text-right"><p className="text-lg">Alberto Mielgo</p><p className="text-xs text-cream/70">diretor, pintor e animador</p></div></div>
          </aside>
        </section>
        <section className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div>
            <h2 className="mb-2 text-sm">Outros de Alberto Mielgo</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{related.map(([title, image, duration]) => <MediaCard key={title} title={title} image={image} duration={duration} />)}</div>
            <h2 className="mb-2 mt-5 text-sm">Recomendações</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{related.map(([title, image, duration]) => <MediaCard key={`${title}-recommendation`} title={title} image={image} duration={duration} />)}</div>
          </div>
          <section className="bg-panel" aria-label="Avaliações">
            <div className="border-b border-white/10 p-3"><span className="text-2xl tracking-widest">☆☆☆☆☆</span><p className="mt-2 text-xs text-cream/70">MWWP720</p><p className="mt-3 text-xs">From the man who brought the amazing concept from Spider-Man into the wider verse.</p></div>
            <div className="p-3"><span className="text-2xl tracking-widest">★★★★★</span><p className="mt-2 text-xs text-cream/70">hanaparkhill35565</p><p className="mt-3 text-xs">Alberto Mielgo is amazing. This short film is a beautiful experience.</p></div>
          </section>
        </section>
      </main>
    </div>
  );
}
