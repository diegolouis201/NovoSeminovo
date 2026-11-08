import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { vitrineDoAnuncio, type Vitrine } from "@novoseminovo/shared-types";
import { fetchListing, resolveMediaUrl } from "@/lib/api";
import { SITE_URL } from "@/lib/company";

// Vitrine do carro / do imóvel em imagem: card (Instagram/WhatsApp), story e
// cartaz A4 para imprimir e colar no vidro do carro ou no portão. Só dados
// públicos do anúncio; o contato acontece pelo site (QR leva ao anúncio).
const FORMATOS = {
  card: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  cartaz: { width: 1654, height: 2339 }, // A4 a 200 dpi
} as const;
type Formato = keyof typeof FORMATOS;
const LOGO_FILE = join(process.cwd(), "public/marca/novoseminovo-logo-recortado.png");
const FOTO_MAX = 8_000_000;
const AZUL = "#1b4f8f";
const LARANJA = "#f07d00";
const VERDE = "#76b82a";
const TINTA = "#20261b";

// Foto só se for JPEG/PNG de verdade (o gerador não lê WebP) e pequena;
// se falhar, a vitrine sai sem foto em vez de quebrar.
async function fotoDeCapa(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(resolveMediaUrl(url), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > FOTO_MAX) return undefined;
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
    const png = buf.subarray(1, 4).toString("ascii") === "PNG";
    if (!jpeg && !png) return undefined;
    return `data:image/${jpeg ? "jpeg" : "png"};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function Arte({ v, formato, foto, qr, logo }: { v: Vitrine; formato: Formato; foto?: string; qr: string; logo: string }) {
  const { width, height } = FORMATOS[formato];
  const s = formato === "cartaz" ? 1.5 : formato === "story" ? 1.25 : 1; // escala do texto
  const fotoAltura = formato === "card" ? 600 : formato === "story" ? 860 : 860;
  const qrTam = formato === "cartaz" ? 520 : formato === "story" ? 300 : 230;
  return (
    <div style={{ width, height, display: "flex", flexDirection: "column", background: "#f7f8f3", color: TINTA }}>
      {formato === "cartaz" && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 320, flexShrink: 0, background: LARANJA, color: "#ffffff", fontSize: 160, lineHeight: 1.3, paddingTop: 20, fontWeight: 800, letterSpacing: 6 }}>
          {v.chamada}
        </div>
      )}
      <div style={{ display: "flex", position: "relative", flexShrink: 0, height: fotoAltura, background: AZUL, alignItems: "center", justifyContent: "center" }}>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={foto} width={width} height={fotoAltura} style={{ objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", fontSize: 70 * s, fontWeight: 800, color: "#ffffff", padding: 60, textAlign: "center" }}>{v.titulo}</div>
        )}
        {formato !== "cartaz" && (
          <div style={{ display: "flex", position: "absolute", top: 40, left: 40, background: LARANJA, color: "#ffffff", fontSize: 38, fontWeight: 800, padding: "12px 28px", borderRadius: 40 }}>{v.chamada}</div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: `${48 * s}px ${64 * s}px` }}>
        <div style={{ display: "flex", fontSize: 28 * s, fontWeight: 800, color: AZUL, letterSpacing: 2 }}>{v.selo.toUpperCase()}</div>
        <div style={{ display: "flex", fontSize: (formato === "card" ? 58 : 66) * s, fontWeight: 800, lineHeight: 1.1, marginTop: 10 * s }}>{v.titulo}</div>
        <div style={{ display: "flex", fontSize: (formato === "card" ? 76 : 88) * s, fontWeight: 800, color: VERDE, marginTop: 14 * s }}>{v.preco}</div>
        {v.dados.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", marginTop: 18 * s }}>
            {v.dados.map((d) => (
              <div key={d} style={{ display: "flex", background: "#e7ecf4", color: AZUL, fontSize: 32 * s, fontWeight: 700, padding: `${10 * s}px ${22 * s}px`, borderRadius: 40, marginRight: 14 * s, marginBottom: 14 * s }}>
                {d}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", fontSize: 32 * s, color: "#5a6152", marginTop: 6 * s }}>{v.local}</div>
        <div style={{ display: "flex", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: width - qrTam - 200 * s }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={logo} width={199 * s} height={140 * s} />
            <div style={{ display: "flex", fontSize: 28 * s, color: "#5a6152", marginTop: 12 * s }}>
              Aponte a câmera para ver as fotos e falar com o anunciante
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={qr} width={qrTam} height={qrTam} style={{ borderRadius: 16 }} />
        </div>
      </div>
    </div>
  );
}

export async function GET(_req: Request, { params }: { params: { id: string; formato: string } }) {
  const formato = params.formato as Formato;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(params.id) || !(formato in FORMATOS)) return new Response("Não encontrado", { status: 404 });
  const anuncio = await fetchListing(params.id);
  if (!anuncio) return new Response("Não encontrado", { status: 404 });
  const v = vitrineDoAnuncio(anuncio);
  const link = `${SITE_URL}/anuncio/${anuncio.id}`;
  const [logo, foto, qr] = await Promise.all([
    readFile(LOGO_FILE).then((b) => `data:image/png;base64,${b.toString("base64")}`),
    fotoDeCapa(v.foto),
    QRCode.toDataURL(link, { margin: 1, width: 600, color: { dark: TINTA, light: "#ffffff" } }),
  ]);
  return new ImageResponse(<Arte v={v} formato={formato} foto={foto} qr={qr} logo={logo} />, {
    ...FORMATOS[formato],
    headers: { "Cache-Control": "public, max-age=600" },
  });
}
