import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:net";
import { crc32, deflateSync } from "node:zlib";
import sharp from "sharp";
import { MAX_IMAGE_PIXELS, sanitizeUpload, sniffFileType } from "./image-safety";
import { scanForMalware } from "./malware-scan";

// Foto enviada por qualquer pessoa é tratada como suspeita: o tipo real vem
// dos bytes (não do nome nem do que o navegador diz), imagem gigante é
// barrada antes de abrir, e toda foto é redesenhada do zero — o que estiver
// escondido no arquivo (EXIF, script, outro arquivo grudado) fica para trás.

async function jpeg(width = 64, height = 48, exif = false): Promise<Buffer> {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 0, g: 106, b: 164 } } }).jpeg();
  return exif ? image.withExif({ IFD0: { Make: "Golpe", ImageDescription: "<script>alert(1)</script>" } }).toBuffer() : image.toBuffer();
}

function pngHeaderOnly(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.alloc(16))), chunk("IEND", Buffer.alloc(0))]);
}

const file = (buffer: Buffer, mimetype: string, originalname = "foto.jpg") => ({ buffer, mimetype, originalname });

describe("Tipo real do arquivo pelos bytes", () => {
  test("reconhece jpeg, png, webp e pdf", async () => {
    assert.equal(sniffFileType(await jpeg()), "image/jpeg");
    assert.equal(sniffFileType(await sharp(await jpeg()).png().toBuffer()), "image/png");
    assert.equal(sniffFileType(await sharp(await jpeg()).webp().toBuffer()), "image/webp");
    assert.equal(sniffFileType(Buffer.from("%PDF-1.7\n%âãÏÓ\n")), "application/pdf");
  });

  test("HTML, SVG e executável não são imagem, mesmo com nome .jpg", () => {
    assert.equal(sniffFileType(Buffer.from("<html><script>alert(1)</script></html>")), undefined);
    assert.equal(sniffFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')), undefined);
    assert.equal(sniffFileType(Buffer.from("MZ\x90\x00\x03")), undefined);
  });
});

describe("Foto enviada é limpa antes de salvar", () => {
  test("arquivo disfarçado de foto é recusado", async () => {
    await assert.rejects(sanitizeUpload(file(Buffer.from("<html><script>alert(1)</script></html>"), "image/jpeg")), /não é uma imagem/);
    await assert.rejects(sanitizeUpload(file(Buffer.from('<svg onload="alert(1)"/>'), "image/png", "x.png")), /não é uma imagem/);
  });

  test("bomba de pixels (arquivo pequeno dizendo ter 30 mil x 30 mil) é barrada sem abrir", async () => {
    const bomb = pngHeaderOnly(30_000, 30_000);
    assert.ok(bomb.length < 200);
    const started = Date.now();
    await assert.rejects(sanitizeUpload(file(bomb, "image/png", "x.png")), /grande demais/);
    assert.ok(Date.now() - started < 2000);
    assert.ok(30_000 * 30_000 > MAX_IMAGE_PIXELS);
  });

  test("foto normal sai como jpeg redesenhado, sem EXIF e sem o que veio escondido", async () => {
    const payload = Buffer.from("<?php system($_GET['c']); ?>PK\x03\x04malware");
    const poisoned = Buffer.concat([await jpeg(800, 600, true), payload]);
    const clean = await sanitizeUpload(file(poisoned, "image/jpeg"));
    assert.equal(clean.mimetype, "image/jpeg");
    assert.equal(clean.buffer.includes("<?php"), false);
    assert.equal(clean.buffer.includes("PK\x03\x04"), false);
    assert.equal(clean.buffer.includes("Golpe"), false);
    const meta = await sharp(clean.buffer).metadata();
    assert.equal(meta.exif, undefined);
    assert.equal(meta.width, 800);
  });

  test("foto enorme (mas dentro do limite) é reduzida para no máximo 2560 px", async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    const clean = await sanitizeUpload(file(big, "image/jpeg"));
    const meta = await sharp(clean.buffer).metadata();
    assert.equal(Math.max(meta.width!, meta.height!), 2560);
  });

  test("PNG com transparência (logo) vira webp e mantém a transparência", async () => {
    const logo = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const clean = await sanitizeUpload(file(logo, "image/png", "logo.png"));
    assert.equal(clean.mimetype, "image/webp");
    assert.equal((await sharp(clean.buffer).metadata()).hasAlpha, true);
  });
});

describe("Antivírus (ClamAV)", () => {
  const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
  let server: Server;
  let port = 0;

  before(async () => {
    // ClamAV falso: responde como o clamd de verdade (comando INSTREAM).
    server = createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on("data", (data) => {
        chunks.push(data);
        const all = Buffer.concat(chunks);
        if (all.length >= 4 && all.subarray(all.length - 4).readUInt32BE(0) === 0) {
          socket.end(all.includes(Buffer.from("EICAR")) ? "stream: Eicar-Signature FOUND\0" : "stream: OK\0");
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });
  after(() => server.close());

  test("sem antivírus configurado, não bloqueia (e avisa que pulou)", async () => {
    assert.deepEqual(await scanForMalware(Buffer.from("oi"), {}), { clean: true, skipped: true });
  });

  test("arquivo limpo passa; arquivo com vírus é recusado com o nome da ameaça", async () => {
    const env = { CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(port) };
    assert.deepEqual(await scanForMalware(Buffer.from("foto normal"), env), { clean: true });
    assert.deepEqual(await scanForMalware(Buffer.from(EICAR), env), { clean: false, threat: "Eicar-Signature" });
  });

  test("com antivírus configurado mas fora do ar, o envio é recusado (não passa sem verificar)", async () => {
    await assert.rejects(scanForMalware(Buffer.from("x"), { CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: "1" }), /antivírus/i);
  });

  test("upload com vírus é recusado antes de abrir a imagem", async () => {
    const env = { CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(port) };
    const infected = Buffer.concat([await jpeg(), Buffer.from(EICAR)]);
    await assert.rejects(sanitizeUpload(file(infected, "image/jpeg"), env), /vírus|ameaça/i);
  });
});

describe("Armazenamento: segunda conferência antes de gravar", () => {
  test("gravar algo que não bate com o tipo declarado é recusado", async () => {
    const { assertStoredTypeMatches } = await import("./storage");
    assert.throws(() => assertStoredTypeMatches(Buffer.from("<html>"), "image/jpeg"), /não confere/);
    assert.doesNotThrow(async () => assertStoredTypeMatches(await jpeg(), "image/jpeg"));
    // Vídeo do marketing (Hub): MP4 de verdade passa; HTML com nome de vídeo não.
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(32)]);
    assert.doesNotThrow(() => assertStoredTypeMatches(mp4, "video/mp4"));
    assert.throws(() => assertStoredTypeMatches(Buffer.from("<html><script>"), "video/mp4"), /não confere/);
  });
});
