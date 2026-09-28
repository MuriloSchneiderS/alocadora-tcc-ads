import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

export type TranscodeResult = {
  file: File;
  duration: number;
};

let ffmpegLoader: Promise<FFmpeg> | undefined;

async function loadFFmpeg(onProgress: (message: string) => void) {
  if (!ffmpegLoader) {
    ffmpegLoader = (async () => {
      const ffmpeg = new FFmpeg();
      ffmpeg.on("log", ({ message }) => onProgress(message));
      const coreUrl = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
      await ffmpeg.load({
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

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Nao foi possivel converter a imagem para WebP."));
    }, "image/webp", quality);
  });
}

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

async function transcodeWithFFmpeg(file: File, onProgress: (message: string) => void): Promise<File> {
  const ffmpeg = await loadFFmpeg(onProgress);
  const inputName = `input${file.name.match(/\.[^.]+$/)?.[0] ?? ".bin"}`;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const isVideo = file.type.startsWith("video/") || /\.(mp4|avi|mkv|mov|webm)$/i.test(file.name);
  const isGif = file.type === "image/gif" || extension === "gif";
  const outputName = isVideo ? "output.mp4" : isGif ? "output.webp" : "output.m4a";
  const inputBytes = new Uint8Array(await file.arrayBuffer());
  await ffmpeg.writeFile(inputName, inputBytes);

  try {
    if (isVideo) {
      const commonArgs = [
        "-i", inputName,
        "-vf", "scale=w='min(854,iw)':h='min(480,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:a", "aac", "-b:a", "40k", "-ac", "1", "-ar", "22050",
        "-movflags", "+faststart", "-threads", "1",
        outputName,
      ];
      const hevcCode = await ffmpeg.exec([
        "-y", ...commonArgs.slice(0, 6), "-c:v", "libx265", "-crf", "34", "-preset", "slow",
        ...commonArgs.slice(6),
      ]);

      if (hevcCode !== 0) {
        await ffmpeg.deleteFile(outputName).catch(() => undefined);
        const h264Code = await ffmpeg.exec([
          "-y", ...commonArgs.slice(0, 6), "-c:v", "libx264", "-crf", "32", "-preset", "veryslow",
          ...commonArgs.slice(6),
        ]);
        if (h264Code !== 0) throw new Error("O FFmpeg nao conseguiu converter este video.");
      }
    } else if (isGif) {
      const code = await ffmpeg.exec([
        "-y", "-i", inputName,
        "-vf", "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-loop", "0", "-an", "-c:v", "libwebp", "-quality", "45", "-compression_level", "6", outputName,
      ]);
      if (code !== 0) return file;
    } else {
      const code = await ffmpeg.exec([
        "-y", "-i", inputName, "-vn", "-c:a", "aac", "-b:a", "40k", "-ac", "1", "-ar", "22050", outputName,
      ]);
      if (code !== 0) throw new Error("O FFmpeg nao conseguiu converter este audio.");
    }

    const output = await ffmpeg.readFile(outputName);
    if (typeof output === "string") throw new Error("O FFmpeg retornou um arquivo invalido.");
    const type = isVideo ? "video/mp4" : isGif ? "image/webp" : "audio/mp4";
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const result = new File([new Uint8Array(output)], `${baseName}.${isVideo ? "mp4" : isGif ? "webp" : "m4a"}`, { type });
    return isGif && result.size >= file.size ? file : result;
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
  }
}

export async function transcodePublicationFile(
  file: File,
  onProgress: (message: string) => void = () => undefined,
): Promise<TranscodeResult> {
  const duration = file.type.startsWith("video/") || file.type.startsWith("audio/")
    ? await readDuration(file)
    : 0;

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type === "image/gif" || extension === "gif") {
    return { file: await transcodeWithFFmpeg(file, onProgress), duration: 0 };
  }

  if (file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(extension ?? "")) {
    return { file: await transcodeImage(file), duration: 0 };
  }

  if (file.type === "application/pdf" || file.type === "application/epub+zip") {
    return { file, duration: 0 };
  }

  return { file: await transcodeWithFFmpeg(file, onProgress), duration };
}