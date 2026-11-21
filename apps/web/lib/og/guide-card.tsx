import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Imagem de compartilhamento dos guias (auditoria de SEO, 21/11/2026, item
// 10): logo oficial, o grupo do guia e o título — gerada no build, uma por
// página (app/guia/**/opengraph-image.tsx). Texto só de lib/guias.ts.
export const GUIDE_OG_SIZE = { width: 1200, height: 630 };

const LOGO_FILE = join(process.cwd(), "public/marca/novoseminovo-logo-recortado.png");
const LOGO_HEIGHT = 120;
const LOGO_WIDTH = Math.round((LOGO_HEIGHT * 600) / 422);

export async function guideOgImage({ eyebrow, title }: { eyebrow: string; title: string }) {
  const logo = `data:image/png;base64,${(await readFile(LOGO_FILE)).toString("base64")}`;
  // Título longo diminui para caber em até 3 linhas.
  const fontSize = title.length > 70 ? 52 : title.length > 45 ? 60 : 68;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 80px",
          background: "#f7f8f3",
          color: "#20261b",
          borderLeft: "24px solid #76b82a",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={logo} width={LOGO_WIDTH} height={LOGO_HEIGHT} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#006aa4", textTransform: "uppercase", letterSpacing: 2 }}>{eyebrow}</div>
          <div style={{ display: "flex", marginTop: 16, fontSize, fontWeight: 800, lineHeight: 1.12 }}>{title}</div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#5a6152" }}>novoseminovo.com.br/guia</div>
      </div>
    ),
    GUIDE_OG_SIZE,
  );
}
