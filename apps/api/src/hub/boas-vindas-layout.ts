import { safeSharp } from "../common/image-safety";
import type { TextosBoasVindas } from "./boas-vindas-regras";

// Layout da arte de boas-vindas (1080×1350). Tudo que é posição, cor, fonte
// e tamanho fica aqui, para ajustar quando o molde oficial do marketing
// (instagram/artes/_fonte/molde-boas-vindas.html, no repositório deles) chegar.
//
// Fontes: Fredoka (títulos) e Nunito Sans (texto), arquivos OFL em
// apps/api/assets/fonts (o Dockerfile da API instala no fontconfig, que é
// onde o librsvg do sharp procura).

export const ARTE = { largura: 1080, altura: 1350 } as const;

export const CORES = {
  marinho: "#0E2F4A",
  azul: "#006AA4",
  laranja: "#F18E29",
  verde: "#76B82A",
  creme: "#FAF8F3", // fundo liso
} as const;

export const FONTES = { titulo: "Fredoka", texto: "Nunito Sans" } as const;

// Nosso logo (versão chapada, sem sombra nem brilho: apps/api/assets/logo.png).
export const LOGO_MARCA = { topo: 72, altura: 170 } as const;
// Logo da empresa: centralizada, altura máxima 300 px, sem fundo nem efeito.
export const LOGO_EMPRESA = { centroY: 480, larguraMax: 640, alturaMax: 300 } as const;

const MARGEM = 90;
const LARGURA_TEXTO = ARTE.largura - 2 * MARGEM;
const TEXTO_TOPO = 700; // onde começa o bloco de textos
const TEXTO_FIM = 1205; // o bloco não passa daqui (o rodapé fica embaixo)
const RODAPE_Y = 1290;

type Bloco = { id: string; texto: string; fonte: string; peso: number; tamanho: number; cor: string; maxLinhas: number; espacoDepois: number };

// Texto vindo do cadastro: tira caractere de controle (inválido em XML) e
// escapa &, <, >, aspas e apóstrofo antes de entrar no SVG.
export function escaparXml(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type Medir = (texto: string, fonte: string, peso: number, tamanho: number) => Promise<number>;

// Largura real do texto em px, desenhado pelo mesmo motor (Pango) que o
// librsvg usa para o SVG: a quebra de linha não depende de chute por letra.
export const medirTexto: Medir = async (texto, fonte, peso, tamanho) => {
  const img = await safeSharp(undefined, { text: { text: escaparXml(texto), font: `${fonte} ${peso >= 700 ? "Bold" : "Regular"} ${tamanho}`, dpi: 72 } }).png().toBuffer();
  return (await safeSharp(img).metadata()).width ?? 0;
};

// Quebra por palavras pela largura medida; palavra maior que a linha é
// cortada. Passou do máximo de linhas: a última termina em "…".
async function quebrar(b: Bloco, largura: number, medir: Medir): Promise<string[]> {
  const cabe = async (texto: string) => (await medir(texto, b.fonte, b.peso, b.tamanho)) <= largura;
  const linhas: string[] = [];
  let atual = "";
  for (let palavra of b.texto.split(/\s+/).filter(Boolean)) {
    while (!(await cabe(palavra))) {
      let n = palavra.length - 1;
      while (n > 1 && !(await cabe(palavra.slice(0, n)))) n--;
      if (atual) linhas.push(atual), (atual = "");
      linhas.push(palavra.slice(0, n));
      palavra = palavra.slice(n);
    }
    if (!atual) atual = palavra;
    else if (await cabe(`${atual} ${palavra}`)) atual = `${atual} ${palavra}`;
    else linhas.push(atual), (atual = palavra);
  }
  if (atual) linhas.push(atual);
  if (linhas.length <= b.maxLinhas) return linhas;
  const cortadas = linhas.slice(0, b.maxLinhas);
  let ultima = `${cortadas[b.maxLinhas - 1]}…`;
  while (ultima.length > 1 && !(await cabe(ultima))) ultima = `${ultima.slice(0, -2).trimEnd()}…`;
  cortadas[b.maxLinhas - 1] = ultima;
  return cortadas;
}

function blocos(t: TextosBoasVindas, escala: number): Bloco[] {
  return [
    { id: "titulo", texto: t.titulo, fonte: FONTES.titulo, peso: 700, tamanho: Math.round(70 * escala), cor: CORES.marinho, maxLinhas: 3, espacoDepois: 34 * escala },
    { id: "subtitulo", texto: t.subtitulo, fonte: FONTES.texto, peso: 400, tamanho: Math.round(40 * escala), cor: CORES.marinho, maxLinhas: 3, espacoDepois: 30 * escala },
    { id: "link", texto: t.linhaLink, fonte: FONTES.texto, peso: 700, tamanho: Math.round(32 * escala), cor: CORES.azul, maxLinhas: 3, espacoDepois: 0 },
  ];
}

export async function montarSvgBoasVindas(t: TextosBoasVindas, medirSemCache: Medir = medirTexto): Promise<string> {
  const cache = new Map<string, Promise<number>>();
  const medir: Medir = (texto, fonte, peso, tamanho) => {
    const chave = `${fonte}|${peso}|${tamanho}|${texto}`;
    if (!cache.has(chave)) cache.set(chave, medirSemCache(texto, fonte, peso, tamanho));
    return cache.get(chave)!;
  };
  // Diminui tudo junto até caber entre o logo e o rodapé sem cortar texto
  // (só um nome enorme, mesmo na letra menor, termina em "…").
  let escala = 1;
  let partes: { b: Bloco; linhas: string[] }[] = [];
  for (; escala >= 0.6; escala -= 0.05) {
    partes = [];
    for (const b of blocos(t, escala)) partes.push({ b, linhas: await quebrar(b, LARGURA_TEXTO, medir) });
    const altura = partes.reduce((s, p) => s + p.linhas.length * p.b.tamanho * 1.2 + p.b.espacoDepois, 0) + 30;
    const cortou = partes.some((p) => p.linhas.at(-1)?.endsWith("…"));
    if (altura <= TEXTO_FIM - TEXTO_TOPO && !cortou) break;
  }

  const meio = ARTE.largura / 2;
  const out: string[] = [];
  let y = TEXTO_TOPO;
  for (const { b, linhas } of partes) {
    for (const linha of linhas) {
      y += b.tamanho * 1.2;
      out.push(
        `<text data-bloco="${b.id}" x="${meio}" y="${Math.round(y - b.tamanho * 0.25)}" text-anchor="middle" font-family="${b.fonte}" font-weight="${b.peso}" font-size="${b.tamanho}" fill="${b.cor}">${escaparXml(linha)}</text>`,
      );
    }
    if (b.id === "titulo") {
      // Traço laranja entre o título e o subtítulo.
      out.push(`<rect x="${meio - 50}" y="${Math.round(y + 8)}" width="100" height="8" rx="4" fill="${CORES.laranja}"/>`);
      y += 30;
    }
    y += b.espacoDepois;
  }

  return `<svg width="${ARTE.largura}" height="${ARTE.altura}" viewBox="0 0 ${ARTE.largura} ${ARTE.altura}" xmlns="http://www.w3.org/2000/svg">
  ${out.join("\n  ")}
  <rect x="${MARGEM}" y="${RODAPE_Y - 52}" width="${LARGURA_TEXTO}" height="3" rx="1.5" fill="${CORES.verde}"/>
  <text data-bloco="rodape" x="${meio}" y="${RODAPE_Y}" text-anchor="middle" font-family="${FONTES.texto}" font-weight="700" font-size="30" fill="${CORES.marinho}">${escaparXml(t.rodape)}</text>
</svg>`;
}
