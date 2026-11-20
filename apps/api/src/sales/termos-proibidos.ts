// Único lugar da API que escreve nomes de programas encerrados, de
// parceiros, de concorrentes e de CRMs que os vendedores IA NÃO podem citar
// (decisões do Diego). Fica isolado para as varreduras de texto
// (no-cashback.spec, sem-passaporte.spec) continuarem valendo para o resto do
// código: aqui eles só aparecem como proibição.
export const PROGRAMAS_ENCERRADOS = ["cashback", "Passaporte", "Diário do Carro"] as const;
export const PARCEIROS_NAO_CITAR = ["Creditas", "Loft"] as const;
// Portais concorrentes e CRMs: a empresa pode citar, o vendedor nunca
// (roteiro de 20/11/2026). "ZAP" sozinho não entra (é gíria de WhatsApp).
export const CONCORRENTES_NAO_CITAR = ["OLX", "Webmotors", "VivaReal", "Viva Real", "ZAP Imóveis", "Zap Imoveis", "Grupo ZAP", "iCarros", "Mobiauto", "Imovelweb", "Chaves na Mão", "QuintoAndar", "Quinto Andar", "Mercado Livre"] as const;
export const CRMS_NAO_CITAR = ["Jetimob", "Vista Soft", "Kenlo", "InGaia", "Imoview", "Tecimob", "Univen", "RD Station", "HubSpot", "Pipedrive", "Salesforce"] as const;
// Frases que o vendedor nunca usa: o cadastro não promete "sem cartão", o
// link do CRM atualiza a cada hora (não é "tempo real") e não existe
// "parceiro oficial".
export const FRASES_NAO_USAR = ["sem cartão", "tempo real", "parceiro oficial", "parceira oficial"] as const;

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (s: string) => sem(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
// Programas encerrados e parceiros (vale também para os posts de boas-vindas).
export const TERMOS_PROIBIDOS_REGEX = new RegExp(`\\b(${[...PROGRAMAS_ENCERRADOS, ...PARCEIROS_NAO_CITAR].map(esc).join("|")})\\b`);
// Só nos vendedores IA: concorrentes, CRMs e frases que o Diego vetou.
export const VENDEDOR_NAO_DIZ_REGEX = new RegExp(`\\b(${[...CONCORRENTES_NAO_CITAR, ...CRMS_NAO_CITAR, ...FRASES_NAO_USAR].map(esc).join("|")})\\b`);
