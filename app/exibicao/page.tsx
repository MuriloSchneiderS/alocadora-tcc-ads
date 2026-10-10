import Header from "../components/Header";
import MediaCard from "../components/MediaCard";
import ChannelInfo from "../components/ChannelInfo";
import VideoPlayer from "../components/VideoPlayer";
import PublicationDetail from "./PublicationDetail";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type PublicationMedia = {
  url: string;
  mimeType: string;
  title: string;
  description: string;
  fileName: string;
};

const related = [
  ["Marathon - Official Cinematic Short Story Trailer", "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=600&q=80", "8:44"],
  ["Watch Dogs: Legion - Tipping Point Cinematic Trailer", "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80", "1:35"],
  ["Alberto Mielgo - Spider-Man: Into the Spider-Verse", "https://images.unsplash.com/photo-1534809027769-b00d750a6bac?auto=format&fit=crop&w=600&q=80", "1:20"],
  ["Love, Death + Robots | Netflix", "https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&w=600&q=80", "2:14"],
];

const fallbackMedia: PublicationMedia = {
  url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  mimeType: "video/mp4",
  title: "The Windshield Wiper",
  description: "Arquivo de demonstração. Quando o Firestore estiver conectado, estes dados virão do documento da publicação.",
  fileName: "the-windshield-wiper.mp4",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function mediaKind(media: PublicationMedia) {
  const mimeType = media.mimeType.toLowerCase();
  const extension = media.fileName.toLowerCase().split(".").pop();

  if (mimeType.startsWith("video/") || extension === "webm" || extension === "mp4") return "video";
  if (mimeType.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a"].includes(extension ?? "")) return "audio";
  if (mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(extension ?? "")) return "image";
  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (mimeType === "application/epub+zip" || extension === "epub") return "epub";
  return "unknown";
}

function MediaViewer({ media }: { media: PublicationMedia }) {
  const kind = mediaKind(media);
  const fallback = <a href={media.url} target="_blank" rel="noreferrer" className="mt-3 inline-block border border-cream/30 px-4 py-2 text-sm hover:border-gold hover:bg-gold hover:text-navy">Abrir ou baixar arquivo</a>;

  if (kind === "video") return <VideoPlayer src={media.url} type={media.mimeType} title={media.title} fallback={fallback} />;
  if (kind === "audio") return <div className="flex h-full min-h-48 items-center justify-center bg-panel p-6"><audio className="w-full" controls preload="metadata" src={media.url}>{fallback}</audio></div>;
  if (kind === "image") return <img src={media.url} alt={media.title} className="h-full w-full object-contain" />;
  if (kind === "pdf" || kind === "epub") return <iframe title={media.title} src={media.url} className="h-full min-h-[60vh] w-full border-0 bg-white" />;
  return <div className="flex h-full min-h-48 flex-col items-center justify-center bg-panel p-6 text-center"><p>Este formato não possui visualização direta no navegador.</p>{fallback}</div>;
}

export default async function Exibicao({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const publicationId = firstParam(params.publicationId);
  if (publicationId) return <PublicationDetail publicationId={publicationId} />;

  const media: PublicationMedia = {
    ...fallbackMedia,
    url: firstParam(params.url) || fallbackMedia.url,
    mimeType: firstParam(params.mimeType) || fallbackMedia.mimeType,
    title: firstParam(params.title) || fallbackMedia.title,
    description: firstParam(params.description) || fallbackMedia.description,
    fileName: firstParam(params.fileName) || fallbackMedia.fileName,
  };

  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto max-w-[1800px] px-3 py-3 sm:px-5">
        <section className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="aspect-video overflow-hidden bg-black lg:min-h-[60vh] lg:aspect-auto"><MediaViewer media={media} /></div>
          <aside className="flex flex-col bg-panel p-3">
            <h1 className="order-1 mt-2 text-xl font-semibold text-white">{media.title}</h1>
            <div className="order-3 mt-4 flex items-center justify-between gap-3 lg:order-4 lg:mt-auto lg:border-t lg:border-white/10 lg:pt-3">
              <button type="button" className="bg-panel-muted px-5 py-2 text-xl hover:bg-gold hover:text-navy">Seguir</button>
              <ChannelInfo channelId="alberto-mielgo" name="Alberto Mielgo" title="Diretor e animador" avatar="https://i.pravatar.cc/160?img=12" />
            </div>
            <p className="order-2 mt-2 text-sm leading-tight text-cream/80 lg:order-3">{media.description}</p>
          </aside>
        </section>
        <section className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div>
            <h2 className="mb-2 text-sm">Outros de Alberto Mielgo</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{related.map(([title, image, duration]) => <MediaCard key={title} title={title} image={image} duration={duration} />)}</div>
            <h2 className="mb-2 mt-5 text-sm">Recomendações</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{related.map(([title, image, duration]) => <MediaCard key={`${title}-recommendation`} title={title} image={image} duration={duration} />)}</div>
          </div>
          <div>
            <h2 className="mb-2 text-sm">Avaliações</h2>
            <section className="bg-panel" aria-label="Avaliações">
              <div className="border-b border-white/10 p-3"><span className="text-2xl tracking-widest">☆☆☆☆☆</span><p className="mt-2 text-xs text-cream/70">MWWP720</p><p className="mt-3 text-xs">From the man who brought the amazing concept from Spider-Man into the wider verse.</p></div>
              <div className="p-3"><span className="text-2xl tracking-widest">★★★★★</span><p className="mt-2 text-xs text-cream/70">hanaparkhill35565</p><p className="mt-3 text-xs">Alberto Mielgo is amazing. This short film is a beautiful experience.</p></div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
