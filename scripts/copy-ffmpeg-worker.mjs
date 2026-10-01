import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const workerDirectory = dirname(require.resolve("@ffmpeg/ffmpeg/worker"));
const publicDirectory = join(process.cwd(), "public", "ffmpeg");

await mkdir(publicDirectory, { recursive: true });//Cria o diretório público para armazenar os arquivos do worker do FFmpeg, se ele não existir
for (const filename of ["worker.js", "const.js", "errors.js"]) {
  await copyFile(join(workerDirectory, filename), join(publicDirectory, filename));
}