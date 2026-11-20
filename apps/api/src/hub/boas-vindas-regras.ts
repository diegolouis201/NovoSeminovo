import { TERMOS_PROIBIDOS_REGEX } from "../sales/termos-proibidos";

// Post automático de boas-vindas (pedido do Diego, 20/11/2026): regras puras
// — textos da arte, legenda, data planejada e a checagem da legenda.
// Testes em boas-vindas.spec.ts. A posição/cor/fonte de cada elemento da arte
// fica em boas-vindas-layout.ts.

export const SITE_BOAS_VINDAS = "novoseminovo.com.br";
// Slogan oficial (rodapé do site, SiteFooter.tsx, e especificação do Diego).
export const SLOGAN = "Carros e imóveis, sem enrolação.";

export type DadosBoasVindas = {
  // Nome da empresa como está no cadastro (Partner.legalName: o nome fantasia
  // da Receita quando existe; senão a razão social).
  nome: string;
  slug: string;
  type: string;
  // Só o nome do perfil, sem @ (já normalizado por PartnerSocialInputSchema).
  instagram?: string | null;
};

export type TextosBoasVindas = {
  titulo: string;
  subtitulo: string;
  linhaLink: string;
  rodape: string;
  legenda: string;
  tituloConteudo: string;
};

// Corretor(a) autônomo(a) (MEI/empresário individual — ver classifyCompany em
// partners/cnpj.service.ts) é uma pessoa: "Boas-vindas" e "os anúncios de".
const ehPessoa = (type: string) => type === "broker";
const IMOVEIS = new Set(["real_estate_agency", "broker", "builder"]);

// Razão social de MEI/empresário individual traz o CPF no fim ("MARIA SOUZA
// 12345678901"): nunca vai para o post. Também junta espaços repetidos.
export function nomeExibicao(nome: string): string {
  return nome
    .replace(/(^|\s)\d{3}\.?\d{3}\.?\d{3}-?\d{2}\s*$/, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const origemIdBoasVindas = (partnerId: string, rede: "instagram" | "facebook") => `boas-vindas:${partnerId}:${rede}`;
export const prefixoOrigemBoasVindas = (partnerId: string) => `boas-vindas:${partnerId}:`;

export function textosBoasVindas(d: DadosBoasVindas): TextosBoasVindas {
  const nome = nomeExibicao(d.nome);
  const pessoa = ehPessoa(d.type);
  const saudacao = pessoa ? `Boas-vindas ao NovoSeminovo, ${nome}!` : `Bem-vinda ao NovoSeminovo, ${nome}!`;
  const dos = pessoa ? `os anúncios de ${nome}` : `os anúncios da ${nome}`;
  const caminho = `${SITE_BOAS_VINDAS}/lojas/${d.slug}`;
  const arroba = d.instagram ? ` @${d.instagram}` : "";
  return {
    titulo: saudacao,
    subtitulo: `Agora ${dos} também estão aqui.`,
    linhaLink: `${IMOVEIS.has(d.type) ? "Conheça os imóveis" : "Conheça a loja"}: ${caminho}`,
    rodape: `${SITE_BOAS_VINDAS} · ${SLOGAN}`,
    legenda:
      `${saudacao} 🎉 A partir de agora, ${dos} também estão aqui, com a Vitrine para o Instagram, o WhatsApp e a rua. 👉 Conheça: https://${caminho}${arroba}` +
      `\n\n${SLOGAN} Em todo o Brasil. #novoseminovo #bemvinda`,
    tituloConteudo: `Boas-vindas: ${nome}`,
  };
}

// Regras da legenda (Diego): sem preço, sem desconto, sem número de visitas
// ou vendas, sem citar concorrente, sem programa encerrado nem parceiro
// que não se cita (lista única em sales/termos-proibidos.ts). Devolve o que achou.
const CONCORRENTES = ["olx", "webmotors", "icarros", "mercado livre", "mercadolivre", "kavak", "mobiauto", "zap imóveis", "zap imoveis", "vivareal", "viva real", "imovelweb", "quintoandar", "quinto andar", "chaves na mão", "chaves na mao", "loft", "netimóveis", "netimoveis"];
export function problemasLegenda(texto: string): string[] {
  const t = texto.toLowerCase();
  const out: string[] = [];
  if (/r\$\s*\d|\d+\s*reais|\bpre[çc]o/.test(t)) out.push("preço");
  if (/desconto|\d+\s*%|\boff\b|promo[çc][ãa]o/.test(t)) out.push("desconto");
  if (/\d[\d.,]*\s*(mil\s+)?(visitas|visualiza[çc][õo]es|acessos|vendas|vendidos|clientes)/.test(t)) out.push("número de visitas ou vendas");
  if (CONCORRENTES.some((c) => new RegExp(`(^|[^a-z])${c}([^a-z]|$)`).test(t))) out.push("concorrente");
  if (TERMOS_PROIBIDOS_REGEX.test(t.normalize("NFD").replace(/[\u0300-\u036f]/g, "")) || /cash\s+back/.test(t)) out.push("programa encerrado ou parceiro que não se cita");
  return out;
}

// 2 dias úteis depois (sábado e domingo não contam; feriado não entra), às
// 12h de Brasília (America/Sao_Paulo, UTC-3 o ano todo desde 2019).
const OFFSET_SP_MS = 3 * 3_600_000;
export function dataBoasVindas(agora: Date): Date {
  const local = new Date(agora.getTime() - OFFSET_SP_MS);
  const dia = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  let uteis = 0;
  while (uteis < 2) {
    dia.setUTCDate(dia.getUTCDate() + 1);
    const semana = dia.getUTCDay();
    if (semana !== 0 && semana !== 6) uteis++;
  }
  return new Date(dia.getTime() + 12 * 3_600_000 + OFFSET_SP_MS);
}
