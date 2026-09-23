import Header from "../components/Header";
import UploadZone from "../components/UploadZone";

export default function Publicacao() {
  return (
    <div className="min-h-screen bg-ink text-cream">
      <Header showSearch={false} showPublish={false} />
      <main className="mx-auto max-w-3xl bg-panel p-2 sm:p-3">
        <div className="grid gap-4 md:grid-cols-2">
          <UploadZone className="h-72" formats="Formatos aceitos: mp4, webm, jpg, png, webp, mp3, pdf e epub." accept={{ "video/mp4": [".mp4"], "video/webm": [".webm"], "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"], "audio/mpeg": [".mp3"], "application/pdf": [".pdf"], "application/epub+zip": [".epub"] }} />
          <section className="space-y-1">
            <input className="w-full bg-panel-muted px-2 py-1 text-sm placeholder:text-cream" placeholder="Título..." />
            <textarea className="h-16 w-full resize-none bg-panel-muted px-2 py-1 text-xs placeholder:text-cream" placeholder="Descrição..." />
            <p className="text-sm">Miniatura:</p>
            <UploadZone className="h-44" formats="Formatos aceitos: jpg, png, webp." accept={{ "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] }} />
          </section>
        </div>
        <div className="grid gap-3 pt-2 md:grid-cols-2">
          <label className="text-center text-sm">Playlist:<select className="mt-1 block w-full bg-panel-muted px-1 py-1 text-left text-xs"><option>Selecionar</option></select></label>
          <label className="text-center text-sm">Preço<input className="mt-1 block w-full bg-panel-muted px-2 py-1 text-xs" placeholder="R$0" /></label>
          <label className="text-center text-sm">Modelo de monetização:<select className="mt-1 block w-full bg-panel-muted px-1 py-1 text-left text-xs"><option>Gratuito com anúncios</option><option>Aluguel</option><option>Compra avulsa</option></select></label>
          <input className="self-end bg-panel-muted px-2 py-1 text-xs" placeholder="R$2/semana" />
          <button type="button" className="bg-panel-muted py-2 text-xs hover:bg-gold hover:text-navy md:col-span-2">Adicionar monetização</button>
        </div>
        <button type="button" className="ml-auto mt-28 block bg-ink px-20 py-2 text-xs hover:bg-gold hover:text-navy">PUBLICAR</button>
      </main>
    </div>
  );
}
