import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Prévia padrão do site ao compartilhar um link (WhatsApp, Instagram,
// Facebook, Google) — vale pra toda página que não define a própria
// (anúncio usa a foto do bem; ver app/anuncio/[id]/page.tsx).
export const alt = "NovoSeminovo — carros e imóveis, sem enrolação";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Logo oficial (padrão da marca em grade — public/marca), recortada sem margem.
const LOGO_FILE = join(process.cwd(), "public/marca/novoseminovo-logo-recortado.png");
const LOGO_HEIGHT = 230;
const LOGO_WIDTH = Math.round((LOGO_HEIGHT * 764) / 590);
export default async function OpenGraphImage() {
  const logo = `data:image/png;base64,${(await readFile(LOGO_FILE)).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "48px 88px",
          background: "#f7f8f3",
          color: "#20261b",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={logo} width={LOGO_WIDTH} height={LOGO_HEIGHT} style={{ flexShrink: 0 }} />
        <div style={{ display: "flex", flexShrink: 0, marginTop: 36, fontSize: 52, fontWeight: 800, lineHeight: 1.15 }}>
          Carros e imóveis, sem enrolação.
        </div>
        <div style={{ display: "flex", flexShrink: 0, marginTop: 12, fontSize: 30, color: "#5a6152", lineHeight: 1.3 }}>
          Anúncios, chat e simulação de financiamento em todo o Brasil
        </div>
        <div style={{ display: "flex", flexShrink: 0, marginTop: 32 }}>
          <div
            style={{
              background: "#76b82a",
              color: "#20261b",
              fontSize: 30,
              fontWeight: 800,
              padding: "14px 28px",
              borderRadius: 16,
            }}
          >
            novoseminovo.com.br
          </div>
        </div>
      </div>
    ),
    size,
  );
}
