import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { Logger } from "@nestjs/common";
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Nunca derivar a extensão do nome de arquivo que a pessoa mandou — esse
// nome é escolhido por quem faz o upload, e o Express serve /uploads por
// extensão (ver main.ts), não pelo Content-Type validado no fileFilter.
// Sem isto, um JPEG "de mentira" com nome "x.svg" (mimetype forjado só pra
// passar no filtro) seria salvo como .svg e servido como image/svg+xml —
// SVG pode conter <script>, então isso seria XSS armazenado no domínio da
// API. A extensão sempre sai do mimetype já aprovado pelo controller, nunca
// do nome original.
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function extensionForContentType(contentType: string): string {
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
  if (!extension) {
    throw new Error(`Tipo de arquivo não suportado para upload: "${contentType}".`);
  }
  return extension;
}

// Defesa extra contra path traversal: mesmo com nome de arquivo sempre
// gerado por randomUUID() (nunca reaproveitando entrada externa) nos
// pontos de chamada atuais, read()/remove() confirmam que o caminho
// resolvido continua dentro do diretório de uploads antes de tocar o disco
// — qualquer futuro refactor que aceite uma URL "quase confiável" não reabre
// path traversal sozinho.
function resolveWithinUploadsDir(filename: string): string {
  const resolved = resolve(UPLOADS_DIR, filename);
  if (resolved !== UPLOADS_DIR && !resolved.startsWith(UPLOADS_DIR + sep)) {
    throw new Error(`Caminho de foto fora do diretório de uploads: "${filename}".`);
  }
  return resolved;
}

export interface PhotoStorage {
  // Grava o arquivo e devolve a URL pública pra salvar em Photo.url — local
  // devolve caminho relativo (resolvido depois via resolveMediaUrl no
  // front), S3/R2 já devolve a URL absoluta.
  save(buffer: Buffer, originalName: string, contentType: string): Promise<string>;
  remove(url: string): Promise<void>;
  // Relê o arquivo já salvo (usado por AiService.classifyVehiclePhotos pra
  // mandar as fotos existentes do anúncio pra análise visual).
  read(url: string): Promise<Buffer>;
}

// MVP (ver README "Próximos passos"): disco local, servido como estático em
// /uploads (main.ts). Funciona ponta a ponta mas não sobrevive a um
// redeploy sem volume persistente — é o backend padrão quando nenhuma
// variável S3_* está configurada.
export const UPLOADS_DIR = join(process.cwd(), "uploads");
export const UPLOADS_URL_PREFIX = "/uploads";

class LocalDiskStorage implements PhotoStorage {
  async save(buffer: Buffer, _originalName: string, contentType: string): Promise<string> {
    const filename = `${randomUUID()}${extensionForContentType(contentType)}`;
    await mkdir(UPLOADS_DIR, { recursive: true });
    await writeFile(join(UPLOADS_DIR, filename), buffer);
    return `${UPLOADS_URL_PREFIX}/${filename}`;
  }

  async remove(url: string): Promise<void> {
    if (!url.startsWith(UPLOADS_URL_PREFIX)) return;
    const filename = url.slice(`${UPLOADS_URL_PREFIX}/`.length);
    // Arquivo pode já ter sumido do disco (ex.: redeploy sem volume
    // persistente); nunca falha a remoção do registro por isso.
    await unlink(resolveWithinUploadsDir(filename)).catch(() => {});
  }

  async read(url: string): Promise<Buffer> {
    if (!url.startsWith(UPLOADS_URL_PREFIX)) throw new Error(`URL de foto fora do diretório de uploads: ${url}`);
    const filename = url.slice(`${UPLOADS_URL_PREFIX}/`.length);
    return readFile(resolveWithinUploadsDir(filename));
  }
}

// Migração de produção sugerida no README: configurar S3_BUCKET +
// S3_PUBLIC_URL_BASE (mais S3_ENDPOINT/S3_REGION pra R2 ou outro provedor
// compatível com S3 que não seja a AWS) troca o backend sem mexer em quem
// chama ListingsService.addPhotos/removePhoto — o contrato (Photo.url como
// string) é o mesmo dos dois lados.
class S3PhotoStorage implements PhotoStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase: string;
  private readonly acl?: string;

  constructor() {
    this.bucket = required("S3_BUCKET");
    this.publicUrlBase = required("S3_PUBLIC_URL_BASE").replace(/\/+$/, "");
    this.acl = process.env.S3_ACL || undefined;

    this.client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async save(buffer: Buffer, _originalName: string, contentType: string): Promise<string> {
    const key = `${randomUUID()}${extensionForContentType(contentType)}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ...(this.acl ? { ACL: this.acl as "public-read" } : {}),
      }),
    );
    return `${this.publicUrlBase}/${key}`;
  }

  async remove(url: string): Promise<void> {
    if (!url.startsWith(this.publicUrlBase)) return;
    const key = url.slice(`${this.publicUrlBase}/`.length);
    await this.client
      .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
      .catch(() => {});
  }

  async read(url: string): Promise<Buffer> {
    if (!url.startsWith(this.publicUrlBase)) throw new Error(`URL de foto fora do bucket configurado: ${url}`);
    const key = url.slice(`${this.publicUrlBase}/`.length);
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} é obrigatório quando S3_BUCKET está configurado`);
  return value;
}

let storage: PhotoStorage | undefined;

export function getPhotoStorage(): PhotoStorage {
  if (!storage) {
    if (process.env.S3_BUCKET) {
      storage = new S3PhotoStorage();
      Logger.log(`Fotos armazenadas em S3/R2 (bucket "${process.env.S3_BUCKET}")`, "PhotoStorage");
    } else {
      storage = new LocalDiskStorage();
      Logger.log("Fotos armazenadas em disco local (configure S3_BUCKET pra usar S3/R2)", "PhotoStorage");
    }
  }
  return storage;
}

// Fotos importadas do CRM do parceiro (ver IntegrationsService) ficam com a
// URL original do CRM em vez de uma cópia no nosso armazenamento — quem
// precisa dos bytes (post do Instagram, classificação por IA) usa isto, que
// cai pro download protegido quando a foto não é nossa.
export async function readPhotoBytes(url: string): Promise<Buffer> {
  const storage = getPhotoStorage();
  if (url.startsWith(UPLOADS_URL_PREFIX) || !/^https?:\/\//i.test(url)) return storage.read(url);
  try {
    return await storage.read(url);
  } catch {
    const { safeFetch } = await import("./safe-fetch");
    return (await safeFetch(url, { maxBytes: 15_000_000, timeoutMs: 20_000, accept: "image/*" })).buffer;
  }
}
