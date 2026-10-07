import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { strFromU8, unzipSync } from "fflate";

export type TranscodeResult = {
  file: File;
  duration: number;
};

let ffmpegLoader: Promise<FFmpeg> | undefined;

async function loadFFmpeg() {
  if (!ffmpegLoader) {
    ffmpegLoader = (async () => {
      const ffmpeg = new FFmpeg();
      const coreUrl = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
      await ffmpeg.load({
        //Worker processa os arquivos em background, evitando travamentos na interface do usuário
        classWorkerURL: `${window.location.origin}/ffmpeg/worker.js`,
        coreURL: await toBlobURL(`${coreUrl}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${coreUrl}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ffmpeg;
    })();
  }

  try {
    return await ffmpegLoader;
  } catch (error) {
    ffmpegLoader = undefined;
    throw error;
  }
}

//Lê a duração de um arquivo de mídia (áudio ou vídeo) em segundos
function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const media = file.type.startsWith("audio/") ? document.createElement("audio") : document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const duration = Number.isFinite(media.duration) ? media.duration : 0;
      URL.revokeObjectURL(objectUrl);
      resolve(duration);
    };
    media.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(0);
    };
    media.src = objectUrl;
  });
}

//Converte o canvas, que contem a miniatura, para um arquivo WebP
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Nao foi possivel converter a imagem para WebP."));
    }, "image/webp", quality);
  });
}

//Redimensiona e converte imagens para WebP, mantendo a proporção e limitando a largura ou altura máxima para 1280px
async function transcodeImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    throw new Error("Este navegador nao conseguiu preparar a imagem.");
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await canvasToBlob(canvas, 0.48);
  if (blob.size >= file.size) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
}

async function transcodeWithFFmpeg(file: File, onProgress: (progress: number) => void, duration: number): Promise<File> {
  const ffmpeg = await loadFFmpeg();
  const inputName = `input${file.name.match(/\.[^.]+$/)?.[0] ?? ".bin"}`;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const isVideo = file.type.startsWith("video/") || /\.(mp4|avi|mkv|mov|webm)$/i.test(file.name);
  const isGif = file.type === "image/gif" || extension === "gif";
  const outputName = isVideo ? "output.mp4" : isGif ? "output.webp" : "output.m4a";
  const inputBytes = new Uint8Array(await file.arrayBuffer());
  await ffmpeg.writeFile(inputName, inputBytes);
  let lastProgress = 0;
  const progressListener = ({ progress }: { progress: number }) => {
    lastProgress = Math.max(lastProgress, Math.min(1, Math.max(0, progress)));
    onProgress(lastProgress);
  };
  const logListener = ({ message }: { message: string }) => {
    const timestamp = message.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
    if (!timestamp || duration <= 0) return;
    const elapsed = Number(timestamp[1]) * 3600 + Number(timestamp[2]) * 60 + Number(timestamp[3]);
    lastProgress = Math.max(lastProgress, Math.min(0.98, elapsed / duration));
    onProgress(lastProgress);
  };
  ffmpeg.on("progress", progressListener);
  ffmpeg.on("log", logListener);
  onProgress(0.02);

  try {
    if (isVideo) {
      const code = await ffmpeg.exec([
        "-y", "-i", inputName,
        "-vf", "scale=w='min(854,iw)':h='min(480,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v", "libx264", "-crf", "32", "-preset", "ultrafast",
        "-c:a", "aac", "-b:a", "40k", "-ac", "1", "-ar", "22050",
        "-movflags", "+faststart", "-threads", "1",
        outputName,
      ]);
      if (code !== 0) throw new Error("O FFmpeg nao conseguiu converter este video.");
    } else if (isGif) {
      const code = await ffmpeg.exec([
        "-y", "-i", inputName,
        "-vf", "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-loop", "0", "-an", "-c:v", "libwebp", "-quality", "45", "-compression_level", "6", outputName,
      ]);
      if (code !== 0) {
        onProgress(1);
        return file;
      }
    } else {
      const code = await ffmpeg.exec([
        "-y", "-i", inputName, "-vn", "-c:a", "aac", "-b:a", "40k", "-ac", "1", "-ar", "22050", outputName,
      ]);
      if (code !== 0) throw new Error("O FFmpeg nao conseguiu converter este audio.");
    }

    const output = await ffmpeg.readFile(outputName);
    if (typeof output === "string") throw new Error("O FFmpeg retornou um arquivo invalido.");
    onProgress(1);
    const type = isVideo ? "video/mp4" : isGif ? "image/webp" : "audio/mp4";
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const result = new File([new Uint8Array(output)], `${baseName}.${isVideo ? "mp4" : isGif ? "webp" : "m4a"}`, { type });
    return isGif && result.size >= file.size ? file : result;
  } finally {
    ffmpeg.off("progress", progressListener);
    ffmpeg.off("log", logListener);
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
  }
}

//Gera uma miniatura automática para arquivos de vídeo, PDF ou EPUB
async function createVideoThumbnail(file: File): Promise<File> {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        const frameTime = Math.min(1, Math.max(0, video.duration * 0.05));
        if (frameTime <= 0.01) {
          video.onloadeddata = () => resolve();
        } else {
          video.onseeked = () => resolve();
          video.currentTime = frameTime;
        }
      };
      video.onerror = () => reject(new Error("Nao foi possivel ler um frame inicial do video."));
      video.src = objectUrl;
    });

    if (!video.videoWidth || !video.videoHeight) throw new Error("O video nao contem um frame valido para a miniatura.");
    const scale = Math.min(1, 640 / video.videoWidth, 360 / video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Este navegador nao conseguiu preparar a miniatura do video.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await canvasToWebpFile(canvas, `${file.name.replace(/\.[^.]+$/, "")}-miniatura.webp`, 0.6);
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    video.load();
  }
}

//Gera uma miniatura automática para arquivos PDF usando a primeira página do documento
async function createPdfThumbnail(file: File): Promise<File> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;

  try {
    const page = await pdf.getPage(1);
    const initialViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1, 960 / initialViewport.width, 1280 / initialViewport.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Este navegador nao conseguiu preparar a miniatura do PDF.");
    await page.render({ canvasContext: context, viewport }).promise;
    return await canvasToWebpFile(canvas, `${file.name.replace(/\.pdf$/i, "")}-miniatura.webp`, 0.65);
  } finally {
    await pdf.destroy();
  }
}

//Quebra o texto em linhas para caber dentro de uma largura máxima no canvas
function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

//Gera uma miniatura automática para arquivos EPUB usando a primeira seção de leitura do documento
async function createEpubThumbnail(file: File): Promise<File> {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const containerFile = entries["META-INF/container.xml"];
  if (!containerFile) throw new Error("O EPUB nao possui um arquivo de estrutura valido.");

  const container = new DOMParser().parseFromString(strFromU8(containerFile), "application/xml");
  const packagePath = container.getElementsByTagNameNS("*", "rootfile")[0]?.getAttribute("full-path");
  if (!packagePath || !entries[packagePath]) throw new Error("Nao foi possivel localizar a estrutura de leitura do EPUB.");

  const packageDocument = new DOMParser().parseFromString(strFromU8(entries[packagePath]), "application/xml");
  const manifest = new Map(
    Array.from(packageDocument.getElementsByTagNameNS("*", "item"), (item) => [
      item.getAttribute("id") ?? "",
      item.getAttribute("href") ?? "",
    ]),
  );
  const firstReadingItem = Array.from(packageDocument.getElementsByTagNameNS("*", "itemref"))
    .find((item) => item.getAttribute("linear") !== "no");
  const firstHref = firstReadingItem ? manifest.get(firstReadingItem.getAttribute("idref") ?? "") : undefined;
  if (!firstHref) throw new Error("Nao foi possivel localizar a primeira secao de leitura do EPUB.");

  const chapterPath = decodeURIComponent(new URL(firstHref, `https://epub.invalid/${packagePath}`).pathname.slice(1));
  const chapterFile = entries[chapterPath];
  if (!chapterFile) throw new Error("A primeira secao de leitura do EPUB nao foi encontrada.");

  const chapter = new DOMParser().parseFromString(strFromU8(chapterFile), "text/html");
  const heading = chapter.querySelector("h1, h2, h3")?.textContent?.replace(/\s+/g, " ").trim();
  const title = heading || chapter.title || file.name.replace(/\.epub$/i, "");
  const bodyText = chapter.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (!bodyText) throw new Error("A primeira secao do EPUB nao contem texto para a miniatura.");

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este navegador nao conseguiu preparar a miniatura do EPUB.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#18212f";
  context.font = "bold 28px Georgia, serif";
  const titleLines = wrapCanvasText(context, title, 520);
  let y = 72;
  for (const line of titleLines.slice(0, 3)) {
    context.fillText(line, 60, y, 520);
    y += 38;
  }

  context.fillStyle = "#424b57";
  context.font = "17px Georgia, serif";
  y += 22;
  const bodyLines = wrapCanvasText(context, bodyText.slice(0, 2400), 520);
  for (const line of bodyLines) {
    if (y > 740) break;
    context.fillText(line, 60, y, 520);
    y += 25;
  }

  return canvasToWebpFile(canvas, `${file.name.replace(/\.epub$/i, "")}-miniatura.webp`, 0.68);
}

export async function createAutomaticThumbnail(file: File): Promise<File | null> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(extension ?? "")) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      throw new Error("Este navegador nao conseguiu preparar a miniatura.");
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvasToWebpFile(canvas, `${file.name.replace(/\.[^.]+$/, "")}-miniatura.webp`, 0.55);
  }
  if (file.type.startsWith("video/") || ["mp4", "avi", "mkv", "mov", "webm"].includes(extension ?? "")) return createVideoThumbnail(file);
  if (file.type === "application/pdf" || extension === "pdf") return createPdfThumbnail(file);
  if (file.type === "application/epub+zip" || extension === "epub") return createEpubThumbnail(file);
  return null;
}

//Transcodifica arquivos de mídia (áudio, vídeo, imagens, PDF e EPUB) para formatos compatíveis com a plataforma, mantendo a qualidade e o tamanho do arquivo dentro de limites razoáveis
export async function transcodePublicationFile(
  file: File,
  onProgress: (progress: number) => void = () => undefined,
): Promise<TranscodeResult> {
  onProgress(0);
  const duration = file.type.startsWith("video/") || file.type.startsWith("audio/")
    ? await readDuration(file)
    : 0;

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type === "image/gif" || extension === "gif") {
    return { file: await transcodeWithFFmpeg(file, onProgress, 0), duration: 0 };
  }

  if (file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(extension ?? "")) {
    onProgress(0.05);
    const image = await transcodeImage(file);
    onProgress(1);
    return { file: image, duration: 0 };
  }

  if (file.type === "application/pdf" || file.type === "application/epub+zip") {
    onProgress(1);
    return { file, duration: 0 };
  }

  return { file: await transcodeWithFFmpeg(file, onProgress, duration), duration };
}

//Converte o canvas, que contem a miniatura, para um arquivo WebP
function canvasToWebpFile(canvas: HTMLCanvasElement, name: string, quality: number): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Nao foi possivel gerar a miniatura."));
        return;
      }
      resolve(new File([blob], name, { type: "image/webp" }));
    }, "image/webp", quality);
  });
}