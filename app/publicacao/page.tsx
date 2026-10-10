'use client';

import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Header from "../components/Header";
import MonetizationEditor, { formatToCents, toCents, type MonetizationDraft, type MonetizationModel } from "../components/MonetizationEditor";
import UploadZone from "../components/UploadZone";
import { db, storage } from "../../lib/firebase";
import { createAutomaticThumbnail, transcodePublicationFile } from "../../lib/transcode";
import { useAuth } from "../providers";

const modelosMonetizacao: MonetizationModel[] = [
  { label: "Gratuito com anúncios", type: "gratuito", free: true },
  { label: "Aluguel", type: "aluguel" },
  { label: "Compra avulsa", type: "compra" },
];
type CatalogOption = { id: string; titulo: string };
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

/*A conversão está em transcode.ts e acontece no navegador, antes do envio ao Storage.
O FFmpeg roda em WebAssembly e seu núcleo é carregado sob demanda do unpkg.com;
o usuário não precisa instalar nada no computador.
Vídeos: reduz para no máximo 854×480, sem ampliar vídeos menores, preservando a proporção. Tenta H.265/HEVC com CRF 34 e preset slow; se falhar, tenta H.264 com CRF 32 e preset veryslow. O áudio do vídeo vira AAC mono, 40 kbps e 22,05 kHz. O MP4 recebe faststart.
Áudios: converte para AAC/M4A mono, 40 kbps e 22,05 kHz.
GIFs: tenta converter para WebP animado, com dimensão máxima de 1280 px e qualidade 45. Mantém o GIF original se a conversão falhar ou gerar um arquivo maior.
Imagens estáticas: não passam pelo FFmpeg. O navegador usa Canvas para gerar WebP com até 1280 px e qualidade 0,48; só usa o resultado se ele for menor que o original.
PDF e EPUB: permanecem sem conversão.*/

//Determina o tipo de publicação com base no arquivo enviado
function getPublicationType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(extension ?? "")) return "imagem";
  if (file.type.startsWith("video/") || ["mp4", "avi", "mkv", "mov", "webm"].includes(extension ?? "")) return "video";
  if (file.type.startsWith("audio/") || ["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(extension ?? "")) return "audio";
  return "livro";
}

//Gera uma mensagem informando sobre o tratamento da falta de miniatura
function getAutomaticThumbnailNotice(file: File) {
  const type = getPublicationType(file);
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (type === "video") return "Vamos usar um frame do início do vídeo. Ele pode não representar a melhor cena; uma miniatura personalizada costuma dar mais controle sobre a prévia.";
  if (type === "imagem") return "A própria imagem será usada como miniatura. Ela também aparecerá como prévia da publicação.";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "A primeira página do PDF será usada como miniatura. Se ela não for uma boa prévia, volte e escolha outra imagem.";
  if (file.type === "application/epub+zip" || extension === "epub") return "Como a paginação do EPUB muda conforme a tela e a fonte, vamos criar uma prévia com o título e o conteúdo inicial da primeira seção de leitura.";
  return "Sem uma miniatura, esta publicação poderá aparecer sem imagem de prévia em catálogos e listas.";
}
//Verifica se o arquivo enviado tem miniatura automática (imagem, vídeo, PDF, EPUB ou WebP)
function hasAutomaticThumbnail(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return file.type.startsWith("image/")
    || file.type.startsWith("video/")
    || file.type === "application/pdf"
    || file.type === "application/epub+zip"
    || ["jpg", "jpeg", "png", "webp", "gif", "mp4", "avi", "mkv", "mov", "webm", "pdf", "epub"].includes(extension ?? "");
}

//Envia o arquivo da publicação ao Storage, com suporte a progresso e cancelamento
async function uploadPublicationFile(userId: string, publicationId: string, file: File, kind: "archive" | "thumbnail", onProgress: (progress: number) => void, revisionId?: string) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  //Define o caminho do arquivo no Storage com base no tipo (arquivo ou miniatura)
  const path = kind === "archive"
    ? `publicacoes/arquivos/${userId}/${publicationId}/arquivo${revisionId ? `-${revisionId}` : ""}.${extension}`
    : `publicacoes/miniaturas/${userId}/${publicationId}/miniatura${revisionId ? `-${revisionId}` : ""}.${extension}`;
  const fileRef = ref(storage, path);//Referência do arquivo no Storage

  try {
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(fileRef, file, { contentType: file.type });
      //Monitora o progresso e chama a função onProgress com o percentual concluído
      task.on("state_changed", (snapshot) => {
        onProgress(snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes : 0);
      }, reject, resolve);
    });

    const url = kind === "thumbnail" ? await getDownloadURL(fileRef) : "";
    return { url, path, reference: fileRef };
  } catch (error) {//Em caso de erro tenta excluir o arquivo parcialmente enviado
    await deleteObject(fileRef).catch(() => undefined);
    throw error;
  }
}

type ExistingPublication = {
  arquivo: string;
  miniatura: string;
  tipo: string;
  tamanho: number;
  duracao: number;
};

function storagePathFromUrl(url: string) {
  try {
    const match = new URL(url).pathname.match(/\/o\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

export default function Publicacao() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [monetizacoes, setMonetizacoes] = useState<MonetizationDraft[]>([
    { model: "Gratuito com anúncios", price: "" },
  ]);
  const [catalogos, setCatalogos] = useState([""]);
  const [catalogosDisponiveis, setCatalogosDisponiveis] = useState<CatalogOption[]>([]);
  const [carregandoCatalogos, setCarregandoCatalogos] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [miniatura, setMiniatura] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState(false);
  const [confirmarMiniatura, setConfirmarMiniatura] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [etapa, setEtapa] = useState("");
  const [editingId, setEditingId] = useState("");
  const [existingPublication, setExistingPublication] = useState<ExistingPublication | null>(null);
  const [editReady, setEditReady] = useState(true);

  useEffect(() => {
    if (!isAuthLoading && !user)
      router.replace("/login");
  }, [isAuthLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let isCurrent = true;

    async function carregarCatalogos() {
      setCarregandoCatalogos(true);
      try {
        const snapshots = await getDocs(query(collection(db, "catalogo"), where("criador", "==", uid)));
        if (isCurrent) setCatalogosDisponiveis(snapshots.docs.map((snapshot) => ({
          id: snapshot.id,
          titulo: String(snapshot.data().titulo ?? "Sem título"),
        })));
      } catch {
        if (isCurrent) setCatalogosDisponiveis([]);
      } finally {
        if (isCurrent) setCarregandoCatalogos(false);
      }
    }

    void carregarCatalogos();
    return () => { isCurrent = false; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const publicationId = new URLSearchParams(window.location.search).get("edit");
    if (!publicationId) return;
    const editPublicationId = publicationId;
    const uid = user.uid;
    let isCurrent = true;

    async function loadPublicationForEdit() {
      try {
        const snapshot = await getDoc(doc(db, "publicacao", editPublicationId));
        if (!snapshot.exists()) throw new Error("Publicação não encontrada.");
        const data = snapshot.data();
        if (data.criador !== uid) throw new Error("Somente o criador pode editar esta publicação.");
        const monetizationSnapshots = await getDocs(collection(db, "publicacao", editPublicationId, "monetizacao"));
        const loadedMonetizations = monetizationSnapshots.docs.flatMap((item) => {
          const monetization = item.data();
          const model = modelosMonetizacao.find((option) => option.type === monetization.tipo);
          if (!model) return [];
          const price = Number(monetization.preco ?? 0);
          return [{
            model: model.label,
            price: model.free ? "" : formatToCents(`${Math.floor(price / 100)},${String(price % 100).padStart(2, "0")}`, true),
          }];
        });
        if (!isCurrent) return;
        setEditingId(editPublicationId);
        setTitulo(String(data.titulo ?? ""));
        setDescricao(String(data.descricao ?? ""));
        setCatalogos(Array.isArray(data.catalogos) && data.catalogos.length > 0 ? data.catalogos : [""]);
        setMonetizacoes(loadedMonetizations.length > 0 ? loadedMonetizations : [{ model: "Gratuito com anúncios", price: "" }]);
        setExistingPublication({
          arquivo: String(data.arquivo ?? ""),
          miniatura: String(data.miniatura ?? ""),
          tipo: String(data.tipo ?? "livro"),
          tamanho: Number(data.tamanho ?? 0),
          duracao: Number(data.duracao ?? 0),
        });
      } catch (caught) {
        if (isCurrent) {
          setErro(true);
          setMensagem(caught instanceof Error ? caught.message : "Não foi possível carregar a publicação.");
        }
      } finally {
        if (isCurrent) setEditReady(true);
      }
    }

    void loadPublicationForEdit();
    return () => { isCurrent = false; };
  }, [user]);

  async function publicar(usarMiniaturaAutomatica = false) {
    if (publicando) return;
    const editing = Boolean(editingId && existingPublication);
    if (!editing && !arquivo) {
      setErro(true);
      setMensagem("Selecione o arquivo da publicação.");
      return;
    }
    if (!titulo.trim()) {
      setErro(true);
      setMensagem("Informe o título da publicação.");
      return;
    }
    
    if (monetizacoes.some((item) => item.model !== "Gratuito com anúncios" && toCents(item.price) <= 0)) {
      setErro(true);
      setMensagem("Informe um preço maior que zero para cada opção paga.");
      return;
    }

    if (!editing && arquivo && !miniatura && !usarMiniaturaAutomatica) {
      if (!hasAutomaticThumbnail(arquivo)) {
        setErro(true);
        setMensagem("Este formato exige uma miniatura personalizada. Envie uma imagem para continuar.");
        return;
      }
      setMensagem("");
      setErro(false);
      setConfirmarMiniatura(true);
      return;
    }

    setConfirmarMiniatura(false);
    setPublicando(true);
    setErro(false);
    setMensagem("");
    setEtapa("Preparando publicação...");
    setProgresso(0);
    let uploadedFile: Awaited<ReturnType<typeof uploadPublicationFile>> | null = null;
    let uploadedThumbnail: Awaited<ReturnType<typeof uploadPublicationFile>> | null = null;
    let publicationSaved = false;

    try {
      const usuario = user;
      if (!usuario) throw new Error("Sua sessão expirou. Entre novamente.");
      const publicationId = editingId || crypto.randomUUID();
      const revisionId = editing ? crypto.randomUUID() : undefined;
      let archivePath = existingPublication?.arquivo ?? "";
      let miniaturaUrl = existingPublication?.miniatura ?? "";
      let tipo = existingPublication?.tipo ?? "livro";
      let tamanho = existingPublication?.tamanho ?? 0;
      let duracao = existingPublication?.duracao ?? 0;

      if (arquivo) {
        setEtapa("Convertendo arquivo principal...");
        const resultado = await transcodePublicationFile(arquivo, (percentual) => {
          setProgresso(Math.round(percentual * 35));
        });
        tipo = getPublicationType(resultado.file);
        tamanho = resultado.file.size;
        duracao = resultado.duration;
        setEtapa("Enviando arquivo principal...");
        uploadedFile = await uploadPublicationFile(usuario.uid, publicationId, resultado.file, "archive", (percentual) => {
          setProgresso(40 + Math.round(percentual * 40));
        }, revisionId);
        archivePath = uploadedFile.path;
      }

      let miniaturaConvertida: File | null = null;
      if (miniatura) {
        setEtapa("Preparando miniatura selecionada...");
        setProgresso(82);
        miniaturaConvertida = (await transcodePublicationFile(miniatura, (percentual) => {
          setProgresso(82 + Math.round(percentual * 5));
        })).file;
      } else if (!editing && arquivo) {
        setEtapa("Gerando miniatura automática...");
        setProgresso(88);
        miniaturaConvertida = await createAutomaticThumbnail(arquivo);
      }

      uploadedThumbnail = miniaturaConvertida
        ? await uploadPublicationFile(usuario.uid, publicationId, miniaturaConvertida, "thumbnail", (percentual) => {
          setEtapa("Enviando miniatura...");
          setProgresso(88 + Math.round(percentual * 8));
        }, revisionId)
        : null;
      if (uploadedThumbnail)
        miniaturaUrl = uploadedThumbnail.url;
      if (!archivePath) throw new Error("O arquivo atual não foi encontrado. Envie o arquivo novamente.");

      setEtapa("Salvando publicação...");
      setProgresso(98);
      const response = await fetch("/api/content", {
        method: editing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await usuario.getIdToken()}`,
        },
        body: JSON.stringify({
          publicationId,
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          tipo,
          tamanho,
          duracao,
          arquivo: archivePath,
          miniatura: miniaturaUrl,
          catalogos: catalogos.filter(Boolean),
          monetizacoes: monetizacoes.map(({ model, price }) => {
            const selectedModel = modelosMonetizacao.find((option) => option.label === model);
            return { tipo: selectedModel?.type ?? "gratuito", preco: selectedModel?.free ? 0 : toCents(price) };
          }),
        }),
      });
      const responseBody = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        if (responseBody?.error === "unauthorized")
          throw new Error("Sua sessão expirou. Entre novamente.");
        if (responseBody?.error === "firebase-configuration")
          throw new Error("As variáveis NEXT_PUBLIC_FIREBASE_API_KEY e NEXT_PUBLIC_FIREBASE_PROJECT_ID precisam estar configuradas no servidor.");
        if (responseBody?.error === "firebase-unavailable")
          throw new Error("Não foi possível conectar aos serviços Firebase. Os arquivos foram enviados, mas os metadados não puderam ser salvos.");
        if (responseBody?.error === "forbidden-catalog")
          throw new Error("Só é possível incluir a publicação em catálogos próprios.");
        if (responseBody?.error === "catalog-not-found")
          throw new Error("Um catálogo selecionado não existe mais. Atualize a página e tente novamente.");
        if (responseBody?.error === "forbidden")
          throw new Error("Somente o criador pode editar esta publicação.");
        if (response.status === 403)
          throw new Error("O Firebase negou a gravação no Firestore. Verifique as regras de segurança e tente novamente.");
        throw new Error("Não foi possível salvar a publicação.");
      }
      publicationSaved = true;

      if (editing && existingPublication) {
        if (uploadedFile && existingPublication.arquivo !== uploadedFile.path)
          await deleteObject(ref(storage, existingPublication.arquivo)).catch(() => undefined);
        if (uploadedThumbnail && existingPublication.miniatura) {
          const oldThumbnailPath = storagePathFromUrl(existingPublication.miniatura);
          if (oldThumbnailPath) await deleteObject(ref(storage, oldThumbnailPath)).catch(() => undefined);
        }
      }

      setProgresso(100);
      setEtapa(editing ? "Alterações concluídas." : "Publicação concluída.");
      setMensagem(editing ? "Publicação atualizada com sucesso." : "Publicação enviada com sucesso.");
      router.push(`/canal/${usuario.uid}`);
    } catch (error) {//Em caso de erro, tenta excluir os arquivos enviados, exibe a mensagem de erro e libera os campos para nova tentativa
      if (!publicationSaved) {
        await Promise.all([
          uploadedFile && deleteObject(uploadedFile.reference).catch(() => undefined),
          uploadedThumbnail && deleteObject(uploadedThumbnail.reference).catch(() => undefined),
        ]);
      }
      setErro(true);
      setEtapa("O processo falhou. Seus campos foram liberados.");
      setMensagem(error instanceof Error ? error.message : "Não foi possível publicar o arquivo.");
    } finally {
      setPublicando(false);
    }
  }

  async function excluirPublicacao() {
    if (!user || !editingId || !existingPublication || publicando) return;
    if (!window.confirm(`Excluir permanentemente "${titulo}"? Esta ação não pode ser desfeita.`)) return;
    setPublicando(true);
    setErro(false);
    setMensagem("Excluindo publicação...");
    try {
      const response = await fetch("/api/content", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ publicationId: editingId }),
      });
      const result = await response.json().catch(() => null) as { error?: string; arquivo?: string; miniatura?: string } | null;
      if (!response.ok) throw new Error(result?.error === "forbidden" ? "Somente o criador pode excluir esta publicação." : "Não foi possível excluir a publicação.");
      const thumbnailPath = storagePathFromUrl(result?.miniatura ?? "");
      await Promise.all([
        result?.arquivo ? deleteObject(ref(storage, result.arquivo)).catch(() => undefined) : Promise.resolve(),
        thumbnailPath ? deleteObject(ref(storage, thumbnailPath)).catch(() => undefined) : Promise.resolve(),
      ]);
      router.push(`/canal/${user.uid}`);
    } catch (caught) {
      setErro(true);
      setMensagem(caught instanceof Error ? caught.message : "Não foi possível excluir a publicação.");
      setPublicando(false);
    }
  }

  //Renderiza uma mensagem de carregamento ou redirecionamento enquanto a sessão do usuário está sendo verificada
  if (isAuthLoading || !user) {
    return (
      <div className="flex min-h-screen flex-col bg-ink text-cream">
        <Header showSearch={false} showPublish={false} />
        <main className="flex flex-1 items-center justify-center" aria-live="polite">
          <p>{isAuthLoading ? "Verificando sessão..." : "Redirecionando para o login..."}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink text-cream">
      <Header showSearch={false} showPublish={false} />
      <main className="mx-auto flex w-full flex-1 flex-col justify-center max-w-3xl bg-panel p-2 sm:p-3">
        {!editReady && <p className="py-3 text-sm text-cream/70">Carregando publicação...</p>}
        <fieldset disabled={publicando || !editReady} className="contents">
        <h1 className="mb-2 border-b border-white/15 pb-2 text-xl font-bold text-white">{editingId ? "Editar publicação" : "Criar publicação"}</h1>
        {/*Área de upload do arquivo e miniatura e informações da publicação*/}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <UploadZone label={editingId ? "Substituir arquivo (opcional)" : undefined} className="h-full" formats="Vídeo, áudio, imagem e livro." accept={formatosArquivo} disabled={publicando} onFileAccepted={setArquivo} />
          </div>
          <section className="space-y-1">
            <input className="w-full bg-panel-muted px-2 py-1 text-sm placeholder:text-cream" placeholder="Título..." value={titulo} required aria-required="true" onChange={(event) => setTitulo(event.target.value)} />
            <textarea className="h-16 w-full resize-none bg-panel-muted px-2 py-1 text-xs placeholder:text-cream" placeholder="Descrição..." value={descricao} onChange={(event) => setDescricao(event.target.value)} />
            <p className="text-sm">{existingPublication?.miniatura ? "Miniatura atual (opcional substituir):" : "Miniatura:"}</p>
            <UploadZone className="h-44" formats="Formatos aceitos: jpg, png, webp." accept={{ "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] }} disabled={publicando} onFileAccepted={setMiniatura} />
          </section>
        </div>
        {/*Área de configuração de monetização e catálogos*/}
        <div className="grid gap-3 pt-2 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            {catalogos.map((catalogo, index) => (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2" key={index}>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-center text-sm">
                    <span className={index === 0 ? "" : "sr-only"}>Catálogo:</span>
                    <select
                      className="mt-1 block h-8 w-full bg-panel-muted px-1 text-left text-xs"
                      value={catalogo}
                      onChange={(event) => setCatalogos((atuais) => atuais.map((atual, atualIndex) => atualIndex === index ? event.target.value : atual))}
                    >
                      <option value="">{carregandoCatalogos ? "Carregando catálogos..." : "Selecionar catálogo"}</option>
                      {catalogosDisponiveis.map((opcao) => (
                        <option key={opcao.id} value={opcao.id} disabled={catalogos.some((selecionado, selecionadoIndex) => selecionadoIndex !== index && selecionado === opcao.id)}>
                          {opcao.titulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-center text-sm">
                    <span className={index === 0 ? "" : "sr-only"}>Preço do catálogo:</span>
                    <input
                      className="mt-1 block h-8 w-full cursor-not-allowed bg-panel-muted px-2 text-xs opacity-70"
                      value=""
                      placeholder="Definido pelo catálogo"
                      readOnly
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="h-8 bg-panel-muted px-2 text-xs hover:bg-red hover:text-white"
                  aria-label={`Remover catálogo ${index + 1}`}
                  onClick={() => setCatalogos((atuais) => atuais.filter((_, atualIndex) => atualIndex !== index))}
                >
                  Remover
                </button>
              </div>
            ))}
            <button
              type="button"
              className="w-full bg-panel-muted py-2 text-xs hover:bg-gold hover:text-navy"
              disabled={carregandoCatalogos || catalogosDisponiveis.length === 0 || catalogos.filter(Boolean).length >= catalogosDisponiveis.length}
              onClick={() => setCatalogos((atuais) => [...atuais, ""])}
            >
              {catalogosDisponiveis.length === 0 && !carregandoCatalogos ? "Você ainda não tem catálogos" : "Adicionar catálogo"}
            </button>
          </div>
          <div className="space-y-2 md:col-span-2">
            <MonetizationEditor models={modelosMonetizacao} value={monetizacoes} onChange={setMonetizacoes} disabled={publicando} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {editingId && <button type="button" disabled={publicando} onClick={() => void excluirPublicacao()} className="bg-red px-8 py-2 text-xs text-white hover:bg-red/80 disabled:cursor-wait disabled:opacity-60">EXCLUIR PUBLICAÇÃO</button>}
          <button type="button" disabled={publicando || !editReady} onClick={() => void publicar()} className="bg-ink px-20 py-2 text-xs hover:bg-gold hover:text-navy disabled:cursor-wait disabled:opacity-60">
            {publicando ? "SALVANDO..." : editingId ? "SALVAR ALTERAÇÕES" : "PUBLICAR"}
          </button>
        </div>
        </fieldset>
        {publicando && (
          <section className="mt-4 space-y-2" aria-live="polite" aria-label="Progresso da publicação">
            <div className="h-2 w-full overflow-hidden bg-panel-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso} aria-valuetext={`${progresso}%`}>
              <div className="h-full bg-gold transition-[width] duration-200" style={{ width: `${progresso}%` }} />
            </div>
            <p className="text-right text-xs">{etapa} {progresso}%</p>
          </section>
        )}
        <p className={`mt-3 text-right text-xs ${erro ? "text-red" : ""}`} role={erro ? "alert" : "status"} aria-live={erro ? "assertive" : "polite"}>{mensagem}</p>
        {confirmarMiniatura && arquivo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <section className="w-full max-w-md space-y-4 border border-black/30 bg-panel p-5 text-ink shadow-xl" role="dialog" aria-modal="true" aria-labelledby="confirmar-miniatura-titulo">
              <h2 id="confirmar-miniatura-titulo" className="text-lg font-semibold text-orange">Publicar sem miniatura personalizada?</h2>
              <p className="text-sm text-amber-50">{getAutomaticThumbnailNotice(arquivo)}</p>
              <p className="text-sm text-amber-50">{hasAutomaticThumbnail(arquivo)
                ? "Você pode continuar com a miniatura automática ou voltar e escolher outra imagem."
                : "Você pode prosseguir sem miniatura ou voltar e enviar uma imagem para a prévia."}</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" className="bg-panel-muted px-4 py-2 text-sm hover:bg-gold" onClick={() => setConfirmarMiniatura(false)}>
                  Voltar e escolher miniatura
                </button>
                <button type="button" className="bg-ink px-4 py-2 text-sm text-cream hover:bg-gold hover:text-navy" onClick={() => void publicar(true)}>
                  {hasAutomaticThumbnail(arquivo) ? "Continuar com miniatura automática" : "Continuar sem miniatura"}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
