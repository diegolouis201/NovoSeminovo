import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { historiaDoCarro } from "@novoseminovo/shared-types";
import { fetchVehicleProfile, resolveMediaUrl } from "@/lib/api";
import { SITE_URL } from "@/lib/company";

// Card do Diário do Carro para Instagram/WhatsApp (1080x1350, retrato).
// Só dados que já são públicos no Passaporte: modelo, ano, selos, nº de
// donos e km — nunca placa inteira nem dono.
const LOGO_FILE = join(process.cwd(), "public/marca/novoseminovo-logo-recortado.png");
const FOTO_MAX = 6_000_000;

// A foto entra só se for JPEG/PNG de verdade (o gerador não lê WebP) e
// pequena; se falhar, o card sai sem foto em vez de quebrar.
async function fotoDeCapa(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(resolveMediaUrl(url), { signal: AbortSignal.timeout(4000) });
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

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(params.id)) return new Response("Não encontrado", { status: 404 });
  const vehicle = await fetchVehicleProfile(params.id);
  if (!vehicle) return new Response("Não encontrado", { status: 404 });

  const historia = historiaDoCarro(vehicle);
  const nome = [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo";
  const link = `${SITE_URL}/veiculo/${vehicle.id}`;
  const [logo, foto, qr] = await Promise.all([
    readFile(LOGO_FILE).then((b) => `data:image/png;base64,${b.toString("base64")}`),
    fotoDeCapa(vehicle.capaUrl),
    QRCode.toDataURL(link, { margin: 1, width: 260, color: { dark: "#20261b", light: "#ffffff" } }),
  ]);
  const capitulos = historia.capitulos.length;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f7f8f3", color: "#20261b" }}>
        <div style={{ display: "flex", height: 620, background: "#1b4f8f", alignItems: "center", justifyContent: "center" }}>
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={foto} width={1080} height={620} style={{ objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", fontSize: 72, fontWeight: 800, color: "#ffffff" }}>{nome}</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "48px 64px", flexGrow: 1 }}>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 800, color: "#1b4f8f", letterSpacing: 2 }}>DIÁRIO DO CARRO</div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, lineHeight: 1.05, marginTop: 8 }}>
            {nome}
            {vehicle.yearModel ? ` ${vehicle.yearModel}` : ""}
          </div>
          <div style={{ display: "flex", fontSize: 36, color: "#5a6152", marginTop: 12 }}>
            {historia.subtitulo} · {capitulos} {capitulos === 1 ? "capítulo" : "capítulos"} de história
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", marginTop: 28 }}>
            {historia.selos.slice(0, 4).map((s) => (
              <div key={s.id} style={{ display: "flex", background: "#e6f2d6", color: "#3d6b10", fontSize: 30, fontWeight: 800, padding: "10px 22px", borderRadius: 40, marginRight: 14, marginBottom: 14 }}>
                <div style={{ display: "flex", width: 26, height: 26, borderRadius: 13, background: "#76b82a", marginRight: 12, alignSelf: "center" }} />
                {s.nome}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
              <img src={logo} width={199} height={140} />
              <div style={{ display: "flex", fontSize: 28, color: "#5a6152", marginTop: 12 }}>Veja a história completa no link ou no QR</div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={qr} width={220} height={220} style={{ borderRadius: 16 }} />
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { "Cache-Control": "public, max-age=600" } },
  );
}
