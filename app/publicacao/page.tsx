'use client';

import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Header from "../components/Header";
import UploadZone from "../components/UploadZone";
import { auth, db, functions, storage } from "../../lib/firebase";
import { transcodePublicationFile } from "../../lib/transcode";

//Firestore
/*publicacao/{publicacaoId}:
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

//Storage
/*
gs:bucket/
├── usuarios/
│ └── {usuarioId}/
│       └── avatar.{ext}
│
├── publicacoes/
│   ├── arquivos/
│   │   └── {publicacaoId}/
│   │       └── {nomeArquivo}.{ext}
│   └── miniaturas/
│       └── {publicacaoId}.{ext}
*/
/*
Formatos no storage após conversão e compressão com ffmpeg (visando eficiência, para não passar do limite gratuito do storage):
imagens(PNG, JPEG, JPG, WebP, GIF): -> WebP
vídeos(MP4, AVI, MKV, MOV, WebM):   -> H.265 (HEVC) em MP4
áudios(MP3, WAV, FLAC, AAC, OGG):   -> AAC em M4A
livros(PDF, EPUB):                  -> PDF otimizado
*/

const modelosMonetizacao = ["Gratuito com anúncios", "Aluguel", "Compra avulsa"];
const formatosArquivo = {
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/x-msvideo": [".avi"],
  "video/x-matroska": [".mkv"],
  "video/quicktime": [".mov"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/flac": [".flac"],
  "audio/aac": [".aac"],
  "audio/ogg": [".ogg"],
  "application/pdf": [".pdf"],
  "application/epub+zip": [".epub"],
};

type ReservationResponse = { reservationId: string; path: string };

function getPublicationType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(extension ?? "")) return "imagem";
  if (file.type.startsWith("video/") || ["mp4", "avi", "mkv", "mov", "webm"].includes(extension ?? "")) return "video";
  if (file.type.startsWith("audio/") || ["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(extension ?? "")) return "audio";
  return "livro";
}

async function uploadPublicationFile(publicationId: string, file: File, kind: "archive" | "thumbnail", onProgress: (message: string) => void) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const reserve = httpsCallable<
    { publicationId: string; kind: "archive" | "thumbnail"; extension: string; size: number },
    ReservationResponse
  >(functions, "reservePublicationUpload");
  const cancel = httpsCallable<{ reservationId: string }, { released: boolean }>(functions, "cancelPublicationUpload");
  const { data } = await reserve({ publicationId, kind, extension, size: file.size });

  try {
    const fileRef = ref(storage, data.path);
    const url = await new Promise<string>((resolve, reject) => {
      const task = uploadBytesResumable(fileRef, file, {
        contentType: file.type,
        customMetadata: { reservationId: data.reservationId },
      });
      task.on("state_changed", (snapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress(`Enviando ${kind === "archive" ? "arquivo" : "miniatura"}: ${progress}%`);
      }, reject, async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (error) {
          reject(error);
        }
      });
    });
    return { url, path: data.path };
  } catch (error) {
    await cancel({ reservationId: data.reservationId }).catch(() => undefined);
    throw error;
  }
}

export default function Publicacao() {
  const router = useRouter();
  const [sessaoVerificada, setSessaoVerificada] = useState(false);//Estado para verificar se a sessão do usuário foi verificada
  const [autenticado, setAutenticado] = useState(false);//Estado para verificar se o usuário está autenticado
  const [monetizacoes, setMonetizacoes] = useState([//Estado para armazenar as monetizações da publicação
    { modelo: "Gratuito com anúncios", preco: "" },
  ]);
  const [catalogos, setCatalogos] = useState([""]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [miniatura, setMiniatura] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  //Verifica a sessão do usuário ao montar o componente
  useEffect(() => onAuthStateChanged(auth, (usuario) => {
    setAutenticado(Boolean(usuario));
    setSessaoVerificada(true);
    if (!usuario) router.replace("/login");//Redireciona para a página de login se o usuário não estiver autenticado
  }), [router]);

  //Função para atualizar o modelo ou preço de uma monetização
  function atualizarMonetizacao(index: number, campo: "modelo" | "preco", valor: string) {
    setMonetizacoes((atuais) => {
      //Evita que dois modelos iguais sejam selecionados
      if (campo === "modelo" && atuais.some((monetizacao, atualIndex) => atualIndex !== index && monetizacao.modelo === valor)) {
        return atuais;
      }

      //Atualiza o campo especificado da monetização no índice fornecido
      return atuais.map((monetizacao, atualIndex) =>
        atualIndex === index
          ? { ...monetizacao, [campo]: campo === "preco" ? valor.replace(/\D/g, "") : valor }
          : monetizacao,
      );
    });
  }

  async function publicar() {
    if (!arquivo || !titulo.trim()) {
      setMensagem("Selecione um arquivo e informe o título.");
      return;
    }
    if (monetizacoes.some((item) => item.modelo !== "Gratuito com anúncios" && Number(item.preco) <= 0)) {
      setMensagem("Informe um preço maior que zero para cada opção paga.");
      return;
    }

    setPublicando(true);
    setMensagem("Convertendo arquivo neste dispositivo...");

    try {
      const usuario = auth.currentUser;
      if (!usuario) throw new Error("Sua sessão expirou. Entre novamente.");

      const resultado = await transcodePublicationFile(arquivo);
      const miniaturaConvertida = miniatura
        ? (await transcodePublicationFile(miniatura)).file
        : null;
      const tipo = getPublicationType(resultado.file);
      const publicationRef = doc(collection(db, "publicacao"));

      const uploadedFile = await uploadPublicationFile(publicationRef.id, resultado.file, "archive", setMensagem);
      const uploadedThumbnail = miniaturaConvertida
        ? await uploadPublicationFile(publicationRef.id, miniaturaConvertida, "thumbnail", setMensagem)
        : null;

      await setDoc(publicationRef, {
        criador: usuario.uid,
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        data_criacao: serverTimestamp(),
        tipo,
        tamanho: resultado.file.size,
        duracao: resultado.duration,
        arquivo: uploadedFile.url,
        miniatura: uploadedThumbnail?.url ?? "",
        catalogos: catalogos.filter(Boolean),
      });

      await Promise.all(monetizacoes.map(({ modelo, preco }) => addDoc(
        collection(db, "publicacao", publicationRef.id, "monetizacao"),
        {
          tipo: modelo === "Gratuito com anúncios" ? "gratuito" : modelo === "Aluguel" ? "aluguel" : "compra",
          preco: modelo === "Gratuito com anúncios" ? 0 : Number(preco),
          moeda: "BRL",
        },
      )));

      setMensagem("Publicação enviada com sucesso.");
      router.push("/painel_controle");
    } catch (error) {
      const errorCode = typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
      setMensagem(errorCode === "functions/not-found"
        ? "A função de upload ainda não foi implantada no Firebase. Implante as Cloud Functions e tente novamente."
        : error instanceof Error ? error.message : "Não foi possível publicar o arquivo.");
    } finally {
      setPublicando(false);
    }
  }

  //Renderiza uma mensagem de carregamento ou redirecionamento enquanto a sessão do usuário está sendo verificada
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
        {/*Área de upload do arquivo e miniatura e informações da publicação*/}
        <div className="grid gap-4 md:grid-cols-2">
          <UploadZone className="h-full" formats="Vídeo, áudio, imagem e livro." accept={formatosArquivo} onFileAccepted={setArquivo} />
          <section className="space-y-1">
            <input className="w-full bg-panel-muted px-2 py-1 text-sm placeholder:text-cream" placeholder="Título..." value={titulo} onChange={(event) => setTitulo(event.target.value)} />
            <textarea className="h-16 w-full resize-none bg-panel-muted px-2 py-1 text-xs placeholder:text-cream" placeholder="Descrição..." value={descricao} onChange={(event) => setDescricao(event.target.value)} />
            <p className="text-sm">Miniatura:</p>
            <UploadZone className="h-44" formats="Formatos aceitos: jpg, png, webp." accept={{ "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] }} onFileAccepted={setMiniatura} />
          </section>
        </div>
        {/*Área de configuração de monetização e catálogos*/}
        <div className="grid gap-3 pt-2 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            {catalogos.map((catalogo, index) => (
              <div className="grid grid-cols-2 gap-3" key={index}>
                <label className="text-center text-sm">
                  <span className={index === 0 ? "" : "sr-only"}>Catálogo:</span>
                  <select
                    className="mt-1 block w-full bg-panel-muted px-1 py-1 text-left text-xs"
                    value={catalogo}
                    onChange={(event) => setCatalogos((atuais) => atuais.map((atual, atualIndex) => atualIndex === index ? event.target.value : atual))}
                  >
                    <option value="">Selecionar</option>
                  </select>
                </label>
                <label className="text-center text-sm">
                  <span className={index === 0 ? "" : "sr-only"}>Preço do catálogo:</span>
                  <input
                    className="mt-1 block w-full cursor-not-allowed bg-panel-muted px-2 py-1 text-xs opacity-70"
                    value=""
                    placeholder="Definido pelo catálogo"
                    readOnly
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="w-full bg-panel-muted py-2 text-xs hover:bg-gold hover:text-navy"
              onClick={() => setCatalogos((atuais) => [...atuais, ""])}
            >
              Adicionar catálogo
            </button>
          </div>
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
                    disabled={monetizacao.modelo === "Gratuito com anúncios"}//Desabilita o campo de preço se o modelo for "Gratuito com anúncios"
                    onChange={(event) => atualizarMonetizacao(index, "preco", event.target.value)}//Atualiza o preço da monetização no índice fornecido
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
        <p className="mt-3 text-right text-xs" aria-live="polite">{mensagem}</p>
        <button type="button" disabled={publicando} onClick={publicar} className="ml-auto mt-2 block bg-ink px-20 py-2 text-xs hover:bg-gold hover:text-navy disabled:cursor-wait disabled:opacity-60">
          {publicando ? "PUBLICANDO..." : "PUBLICAR"}
        </button>
      </main>
    </div>
  );
}
