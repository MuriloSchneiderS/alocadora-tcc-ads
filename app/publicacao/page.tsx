'use client';

import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Header from "../components/Header";
import UploadZone from "../components/UploadZone";
import { auth, db, storage } from "../../lib/firebase";
import { createAutomaticThumbnail, transcodePublicationFile } from "../../lib/transcode";

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

/*A conversão está em transcode.ts e acontece no navegador, antes do envio ao Storage.
O FFmpeg roda em WebAssembly e seu núcleo é carregado sob demanda do unpkg.com;
o usuário não precisa instalar nada no computador.
Vídeos: reduz para no máximo 854×480, sem ampliar vídeos menores, preservando a proporção. Tenta H.265/HEVC com CRF 34 e preset slow; se falhar, tenta H.264 com CRF 32 e preset veryslow. O áudio do vídeo vira AAC mono, 40 kbps e 22,05 kHz. O MP4 recebe faststart.
Áudios: converte para AAC/M4A mono, 40 kbps e 22,05 kHz.
GIFs: tenta converter para WebP animado, com dimensão máxima de 1280 px e qualidade 45. Mantém o GIF original se a conversão falhar ou gerar um arquivo maior.
Imagens estáticas: não passam pelo FFmpeg. O navegador usa Canvas para gerar WebP com até 1280 px e qualidade 0,48; só usa o resultado se ele for menor que o original.
PDF e EPUB: permanecem sem conversão.*/

//R$reais e centavos no campo de input de monetização, apenas centavos no firestore
function formatarReaisCentavos(valor: string, completarCentavos = false) {
  const limpo = valor.replace(/[^\d,]/g, "");
  if (!limpo) return "";

  const separador = limpo.indexOf(",");
  const reais = (separador < 0 ? limpo : limpo.slice(0, separador))
    .replace(/^0+(?=\d)/, "")
    .slice(0, 13);
  const centavos = separador < 0 ? "" : limpo.slice(separador + 1).replace(/,/g, "").slice(0, 2);
  const reaisFormatados = reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (separador < 0 && !completarCentavos) return reaisFormatados;
  const centavosFormatados = completarCentavos ? centavos.padEnd(2, "0") : centavos;
  return `${reaisFormatados || "0"},${centavosFormatados}`;
}
function converterParaCentavos(valor: string) {
  const [reais = "0", centavos = ""] = valor.replace(/\./g, "").split(",", 2);
  return Number(reais || "0") * 100 + Number(centavos.padEnd(2, "0").slice(0, 2));
}

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
async function uploadPublicationFile(publicationId: string, file: File, kind: "archive" | "thumbnail", onProgress: (progress: number) => void) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  //Define o caminho do arquivo no Storage com base no tipo (arquivo ou miniatura)
  const path = kind === "archive"
    ? `publicacoes/arquivos/${publicationId}/arquivo.${extension}`
    : `publicacoes/miniaturas/${publicationId}.${extension}`;
  const fileRef = ref(storage, path);//Referência do arquivo no Storage

  try {
    const url = await new Promise<string>((resolve, reject) => {
      const task = uploadBytesResumable(fileRef, file, { contentType: file.type });
      //Monitora o progresso e chama a função onProgress com o percentual concluído
      task.on("state_changed", (snapshot) => {
        onProgress(snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes : 0);
      }, reject, () => getDownloadURL(task.snapshot.ref).then(resolve, reject));
    });

    return { url, reference: fileRef };
  } catch (error) {//Em caso de erro tenta excluir o arquivo parcialmente enviado
    await deleteObject(fileRef).catch(() => undefined);
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
  const [erro, setErro] = useState(false);
  const [confirmarMiniatura, setConfirmarMiniatura] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [etapa, setEtapa] = useState("");

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
          ? { ...monetizacao, [campo]: campo === "preco" ? formatarReaisCentavos(valor) : valor }
          : monetizacao,
      );
    });
  }

  async function publicar(usarMiniaturaAutomatica = false) {
    if (publicando) return;
    //Arquivo e titulo obrigatórios
    if (!arquivo) {
      setErro(true);
      setMensagem("Selecione o arquivo da publicação.");
      return;
    }
    if (!titulo.trim()) {
      setErro(true);
      setMensagem("Informe o título da publicação.");
      return;
    }
    
    if (monetizacoes.some((item) => item.modelo !== "Gratuito com anúncios" && converterParaCentavos(item.preco) <= 0)) {
      setErro(true);
      setMensagem("Informe um preço maior que zero para cada opção paga.");
      return;
    }

    //Verifica se o arquivo exige miniatura personalizada e se não foi enviada
    if (!miniatura && !usarMiniaturaAutomatica) {
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
      const usuario = auth.currentUser;
      if (!usuario) throw new Error("Sua sessão expirou. Entre novamente.");

      setEtapa("Convertendo arquivo principal...");
      const resultado = await transcodePublicationFile(arquivo, (percentual) => {
        setProgresso(Math.round(percentual * 45));
      });
      const tipo = getPublicationType(resultado.file);
      let miniaturaConvertida: File | null = null;
      const miniaturaUsaArquivoPrincipal = !miniatura && tipo === "imagem";

      if (miniatura) {
        setEtapa("Preparando miniatura selecionada...");
        setProgresso(48);
        //Se a miniatura for um vídeo, converte para WebP;
        miniaturaConvertida = (await transcodePublicationFile(miniatura, (percentual) => {
          setProgresso(48 + Math.round(percentual * 7));
        })).file;
      } else if (!miniaturaUsaArquivoPrincipal) {
        setEtapa("Gerando miniatura automática...");
        setProgresso(52);
        miniaturaConvertida = await createAutomaticThumbnail(arquivo);
      }

      const publicationRef = doc(collection(db, "publicacao"));

      //Acompanhamento do progresso de upload do arquivo principal, 35% do progresso total, de 55% a 90%
      setEtapa("Enviando arquivo principal...");
      uploadedFile = await uploadPublicationFile(publicationRef.id, resultado.file, "archive", (percentual) => {
        setProgresso(55 + Math.round(percentual * 35));
      });

      let miniaturaUrl = miniaturaUsaArquivoPrincipal ? uploadedFile.url : "";
      uploadedThumbnail = miniaturaConvertida
        ? await uploadPublicationFile(publicationRef.id, miniaturaConvertida, "thumbnail", (percentual) => {
          setEtapa("Enviando miniatura...");
          setProgresso(90 + Math.round(percentual * 8));
        })
        : null;
      if (uploadedThumbnail)
        miniaturaUrl = uploadedThumbnail.url;

      setEtapa("Salvando publicação...");
      setProgresso(98);
      await setDoc(publicationRef, {
        criador: usuario.uid,
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        data_criacao: serverTimestamp(),
        tipo,
        tamanho: resultado.file.size,
        duracao: resultado.duration,
        arquivo: uploadedFile.url,
        miniatura: miniaturaUrl,
        catalogos: catalogos.filter(Boolean),
      });
      publicationSaved = true;

      //Salva as monetizações no subcoleção "monetizacao" da publicação, convertendo os preços para centavos
      await Promise.all(monetizacoes.map(({ modelo, preco }) => addDoc(
        collection(db, "publicacao", publicationRef.id, "monetizacao"),
        {
          tipo: modelo === "Gratuito com anúncios" ? "gratuito" : modelo === "Aluguel" ? "aluguel" : "compra",
          preco: modelo === "Gratuito com anúncios" ? 0 : converterParaCentavos(preco),
          moeda: "BRL",
        },
      )));

      setProgresso(100);
      setEtapa("Publicação concluída.");
      setMensagem("Publicação enviada com sucesso.");
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
        <fieldset disabled={publicando} className="contents">
        {/*Área de upload do arquivo e miniatura e informações da publicação*/}
        <div className="grid gap-4 md:grid-cols-2">
          <UploadZone className="h-full" formats="Vídeo, áudio, imagem e livro." accept={formatosArquivo} disabled={publicando} onFileAccepted={setArquivo} />
          <section className="space-y-1">
            <input className="w-full bg-panel-muted px-2 py-1 text-sm placeholder:text-cream" placeholder="Título..." value={titulo} required aria-required="true" onChange={(event) => setTitulo(event.target.value)} />
            <textarea className="h-16 w-full resize-none bg-panel-muted px-2 py-1 text-xs placeholder:text-cream" placeholder="Descrição..." value={descricao} onChange={(event) => setDescricao(event.target.value)} />
            <p className="text-sm">Miniatura:</p>
            <UploadZone className="h-44" formats="Formatos aceitos: jpg, png, webp." accept={{ "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] }} disabled={publicando} onFileAccepted={setMiniatura} />
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
                  <span className={index === 0 ? "" : "sr-only"}>Preço (R$):</span>
                  <span className="mt-1 flex items-center bg-panel-muted px-2 py-1 text-xs focus-within:outline-1 focus-within:outline-gold">
                    <span aria-hidden="true" className="mr-1 text-cream/70">R$</span>
                    <input
                      className="min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed"
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-label={`Preço em reais para ${monetizacao.modelo}`}
                      value={monetizacao.preco}
                      disabled={monetizacao.modelo === "Gratuito com anúncios"}
                      onChange={(event) => atualizarMonetizacao(index, "preco", event.target.value)}
                      onBlur={(event) => atualizarMonetizacao(index, "preco", formatarReaisCentavos(event.target.value, true))}
                    />
                  </span>
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
        <button type="button" disabled={publicando} onClick={() => void publicar()} className="ml-auto mt-4 block bg-ink px-20 py-2 text-xs hover:bg-gold hover:text-navy disabled:cursor-wait disabled:opacity-60">
          {publicando ? "PUBLICANDO..." : "PUBLICAR"}
        </button>
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
