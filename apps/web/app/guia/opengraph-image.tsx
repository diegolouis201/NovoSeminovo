import { GUIDE_OG_SIZE, guideOgImage } from "@/lib/og/guide-card";

export const alt = "Guias do NovoSeminovo para comprar e vender carro e imóvel";
export const size = GUIDE_OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return guideOgImage({ eyebrow: "Guias NovoSeminovo", title: "Guias para comprar e vender sem cair em golpe" });
}
