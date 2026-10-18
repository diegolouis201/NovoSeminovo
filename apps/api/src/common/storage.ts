import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Logger } from "@nestjs/common";
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
  async save(buffer: Buffer, originalName: string, _contentType: string): Promise<string> {
    const filename = `${randomUUID()}${extname(originalName).toLowerCase()}`;
    await mkdir(UPLOADS_DIR, { recursive: true });
    await writeFile(join(UPLOADS_DIR, filename), buffer);
    return `${UPLOADS_URL_PREFIX}/${filename}`;
  }

  async remove(url: string): Promise<void> {
    if (!url.startsWith(UPLOADS_URL_PREFIX)) return;
    const filename = url.slice(`${UPLOADS_URL_PREFIX}/`.length);
    // Arquivo pode já ter sumido do disco (ex.: redeploy sem volume
    // persistente); nunca falha a remoção do registro por isso.
    await unlink(join(UPLOADS_DIR, filename)).catch(() => {});
  }

  async read(url: string): Promise<Buffer> {
    if (!url.startsWith(UPLOADS_URL_PREFIX)) throw new Error(`URL de foto fora do diretório de uploads: ${url}`);
    const filename = url.slice(`${UPLOADS_URL_PREFIX}/`.length);
    return readFile(join(UPLOADS_DIR, filename));
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

  async save(buffer: Buffer, originalName: string, contentType: string): Promise<string> {
    const key = `${randomUUID()}${extname(originalName).toLowerCase()}`;
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
