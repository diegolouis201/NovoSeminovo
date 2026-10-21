import { ImageResponse } from "next/og";

// Prévia padrão do site ao compartilhar um link (WhatsApp, Instagram,
// Facebook, Google) — vale pra toda página que não define a própria
// (anúncio usa a foto do bem; ver app/anuncio/[id]/page.tsx).
export const alt = "NovoSeminovo — carros e imóveis, sem enrolação";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
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
        <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, fontSize: 80, fontWeight: 800, lineHeight: 0.95 }}>
          <span style={{ color: "#006aa4" }}>NOVO</span>
          <span style={{ color: "#f18e29" }}>
            SEM<span style={{ color: "#76b82a" }}>I</span>
          </span>
          <span style={{ color: "#f18e29" }}>
            NOV<span style={{ color: "#76b82a" }}>O</span>
          </span>
        </div>
        <div style={{ display: "flex", flexShrink: 0, marginTop: 36, fontSize: 52, fontWeight: 800, lineHeight: 1.15 }}>
          Carros e imóveis, sem enrolação.
        </div>
        <div style={{ display: "flex", flexShrink: 0, marginTop: 12, fontSize: 30, color: "#5a6152", lineHeight: 1.3 }}>
          Anúncios, chat e simulação de financiamento em BH
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
