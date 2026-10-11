import Header from "../components/Header";
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

  const url = firstParam(params.url);
  if (!url) {
    return <div className="min-h-screen bg-ink text-cream"><Header /><main className="mx-auto max-w-3xl px-5 py-12 text-center">
      <h1 className="text-2xl text-white">Publicação não encontrada</h1>
      <p className="mt-2 text-sm text-cream/70">Escolha uma publicação para assistir ou visualizar o conteúdo.</p>
    </main></div>;
  }

  const media: PublicationMedia = {
    url,
    mimeType: firstParam(params.mimeType) || "application/octet-stream",
    title: firstParam(params.title) || "Publicação",
    description: firstParam(params.description) || "",
    fileName: firstParam(params.fileName) || url.split("/").pop()?.split("?")[0] || "",
  };

  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header />
      <main className="mx-auto max-w-[1800px] px-3 py-3 sm:px-5">
        <section className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="aspect-video overflow-hidden bg-black lg:min-h-[60vh] lg:aspect-auto"><MediaViewer media={media} /></div>
          <aside className="flex flex-col bg-panel p-3">
            <h1 className="text-xl font-semibold text-white">{media.title}</h1>
            <p className="mt-2 text-sm leading-tight text-cream/80">{media.description}</p>
          </aside>
        </section>
      </main>
    </div>
  );
}
