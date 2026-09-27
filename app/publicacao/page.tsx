'use client';

import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Header from "../components/Header";
import UploadZone from "../components/UploadZone";
import { auth } from "../../lib/firebase";

const modelosMonetizacao = ["Gratuito com anúncios", "Aluguel", "Compra avulsa"];
/* publicacao/{publicacaoId}:
criador (id firestore do usuário que criou a publicação),
titulo,
descricao,
data_criacao,
tipo (imagem, video, audio, livro(epub, pdf)),
tamanho (tamanho do arquivo em bytes),
duracao (duração do vídeo ou áudio em segundos),
miniatura (miniatura da publicação (link do storage)),
arquivo (link do storage),
catalogos (array de ids dos catálogos que contém a publicação),
*/
/*publicacao/{publicacaoId}/monetizacao/{monetizacaoId}:
tipo (gratuito, aluguel, compra),
preco (preço da publicação em centavos),
moeda (moeda da publicação, ex: BRL)
*/
/*storage:
gs:bucket/
├── usuarios/
│ └── {usuarioId}/
│       └── avatar.{ext}
│
├── publicacoes/
│   ├── arquivos/
│   │   └── {postId}/
│   │       └── {nomeArquivo}.{ext}
│   └── miniaturas/
│       └── {publicacaoId}.{ext}
*/
/*
Formatos no storage após conversão com ffmpeg (visando eficiência, para não passar do limite gratuito do storage):
imagens(PNG, JPEG, JPG, WebP, GIF): -> WebP
vídeos(MP4, AVI, MKV, MOV, WebM):   -> H.265 (HEVC) em MP4
áudios(MP3, WAV, FLAC, AAC, OGG):   -> AAC em M4A
livros(PDF, EPUB):                  -> PDF otimizado
*/
export default function Publicacao() {
  const router = useRouter();
  const [sessaoVerificada, setSessaoVerificada] = useState(false);
  const [autenticado, setAutenticado] = useState(false);
  const [monetizacoes, setMonetizacoes] = useState([
    { modelo: "Gratuito com anúncios", preco: "" },
  ]);

  useEffect(() => onAuthStateChanged(auth, (usuario) => {
    setAutenticado(Boolean(usuario));
    setSessaoVerificada(true);
    if (!usuario) router.replace("/login");
  }), [router]);

  function atualizarMonetizacao(index: number, campo: "modelo" | "preco", valor: string) {
    setMonetizacoes((atuais) => {
      if (campo === "modelo" && atuais.some((monetizacao, atualIndex) => atualIndex !== index && monetizacao.modelo === valor)) {
        return atuais;
      }

      return atuais.map((monetizacao, atualIndex) =>
        atualIndex === index
          ? { ...monetizacao, [campo]: campo === "preco" ? valor.replace(/\D/g, "") : valor }
          : monetizacao,
      );
    });
  }

  if (!sessaoVerificada || !autenticado) {
    return (
      <div className="flex min-h-screen flex-col bg-ink text-cream">
        <Header showSearch={false} showPublish={false} />
        <main className="flex flex-1 items-center justify-center" aria-live="polite">
          <p>{sessaoVerificada ? "Redirecionando para o login..." : "Verificando sessão..."}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink text-cream">
      <Header showSearch={false} showPublish={false} />
      <main className="mx-auto flex w-full flex-1 flex-col justify-center max-w-3xl bg-panel p-2 sm:p-3">
        <div className="grid gap-4 md:grid-cols-2">
          <UploadZone className="h-full" formats="Formatos aceitos: mp4, webm, jpg, png, webp, mp3, pdf e epub." accept={{ "video/mp4": [".mp4"], "video/webm": [".webm"], "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"], "audio/mpeg": [".mp3"], "application/pdf": [".pdf"], "application/epub+zip": [".epub"] }} />
          <section className="space-y-1">
            <input className="w-full bg-panel-muted px-2 py-1 text-sm placeholder:text-cream" placeholder="Título..." />
            <textarea className="h-16 w-full resize-none bg-panel-muted px-2 py-1 text-xs placeholder:text-cream" placeholder="Descrição..." />
            <p className="text-sm">Miniatura:</p>
            <UploadZone className="h-44" formats="Formatos aceitos: jpg, png, webp." accept={{ "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] }} />
          </section>
        </div>
        <div className="grid gap-3 pt-2 md:grid-cols-2">
          <label className="text-center text-sm">Catalogo:
            <select className="mt-1 block w-full bg-panel-muted px-1 py-1 text-left text-xs">
              <option>Selecionar</option>
            </select>
          </label>
          <label className="text-center text-sm">Preço<input className="mt-1 block w-full bg-panel-muted px-2 py-1 text-xs" placeholder="R$0" /></label>
          <div className="space-y-2 md:col-span-2">
            {monetizacoes.map((monetizacao, index) => (
              <div className="grid grid-cols-2 gap-3" key={index}>
                <label className="text-center text-sm">
                  <span className={index === 0 ? "" : "sr-only"}>Modelo de monetização:</span>
                  <select
                    className="mt-1 block w-full bg-panel-muted px-1 py-1 text-left text-xs"
                    value={monetizacao.modelo}
                    onChange={(event) => atualizarMonetizacao(index, "modelo", event.target.value)}
                  >
                    {modelosMonetizacao.map((modelo) => (
                      <option
                        key={modelo}
                        value={modelo}
                        disabled={monetizacoes.some((outra, outroIndex) => outroIndex !== index && outra.modelo === modelo)}
                      >
                        {modelo}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-center text-sm">
                  <span className={index === 0 ? "" : "sr-only"}>Preço (centavos):</span>
                  <input
                    className="mt-1 block w-full bg-panel-muted px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    value={monetizacao.preco}
                    disabled={monetizacao.modelo === "Gratuito com anúncios"}
                    onChange={(event) => atualizarMonetizacao(index, "preco", event.target.value)}
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="w-full bg-panel-muted py-2 text-xs hover:bg-gold hover:text-navy disabled:cursor-not-allowed disabled:opacity-50"
              disabled={monetizacoes.length >= modelosMonetizacao.length}
              onClick={() => setMonetizacoes((atuais) => {
                const modeloLivre = modelosMonetizacao.find((modelo) => !atuais.some((monetizacao) => monetizacao.modelo === modelo));
                return modeloLivre ? [...atuais, { modelo: modeloLivre, preco: "" }] : atuais;
              })}
            >
              Adicionar monetização
            </button>
          </div>
        </div>
        <button type="button" className="ml-auto mt-4 block bg-ink px-20 py-2 text-xs hover:bg-gold hover:text-navy">PUBLICAR</button>
      </main>
    </div>
  );
}
