import { join } from "node:path";

// Armazenamento em disco local (MVP) — trocar por S3/R2 é a migração de
// produção sugerida no README; até lá, os arquivos vivem aqui e são
// servidos como estáticos em /uploads (ver main.ts). process.cwd() é a raiz
// de apps/api tanto em dev (nest start) quanto em produção (node dist/main.js).
export const UPLOADS_DIR = join(process.cwd(), "uploads");
export const UPLOADS_URL_PREFIX = "/uploads";
