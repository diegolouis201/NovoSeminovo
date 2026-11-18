import { createHash } from "node:crypto";

// Importação de empresas do Mailerfind (busca do Google Maps) para o CRM do
// Hub — regras puras, sem banco (testadas em importacao.spec.ts).
//
// - O tipo do arquivo é decidido pelo conteúdo (nunca pela extensão): tem de
//   ser texto separado por vírgula, ponto e vírgula ou tab. PDF, planilha
//   .xlsx, imagem, binário, HTML e JSON são recusados.
// - Colunas reconhecidas pelo cabeçalho, em português ou inglês.
// - Nada que pareça fórmula de planilha entra; textos têm tamanho máximo;
//   links só http(s).
// - A mesma empresa (telefone, e-mail, site ou nome+cidade) entra uma vez só,
//   inclusive quando aparece repetida no próprio arquivo.

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_LINHAS = 5000;
export const IMPORT_PREVIA_LINHAS = 20;

export const CAMPOS_IMPORT = {
  nome: "Nome da empresa",
  telefone: "Telefone",
  email: "E-mail",
  site: "Site",
  endereco: "Endereço",
  cidade: "Cidade",
  uf: "UF",
  categoria: "Categoria",
  nota: "Nota no Google",
  avaliacoes: "Avaliações",
  mapsUrl: "Link do Google Maps",
  instagram: "Instagram",
  facebook: "Facebook",
  emailsExtras: "Outros e-mails",
  placeId: "ID do lugar no Google (place_id)",
  situacao: "Situação no Google",
  telefoneAlt: "Telefone (outra coluna)",
} as const;
export type CampoImport = keyof typeof CAMPOS_IMPORT;
export type MapaColunas = Partial<Record<CampoImport, number>>;

export type LinhaProspect = {
  linha: number;
  nome: string;
  telefone?: string;
  email?: string;
  site?: string;
  dominio?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  categoria?: string;
  nota?: number;
  avaliacoes?: number;
  mapsUrl?: string;
  instagram?: string;
  facebook?: string;
  placeId?: string;
};
export type LinhaRecusada = { linha: number; nome: string; motivo: string };
export type AnaliseCsv = {
  hash: string;
  cabecalho: string[];
  mapa: MapaColunas;
  total: number;
  validas: LinhaProspect[];
  invalidas: LinhaRecusada[];
  duplicadas: LinhaRecusada[];
  emailsDescartados: number;
};

const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

// ------------------------------------------------------------- arquivo

const MAGICOS: [string, number[]][] = [
  ["PDF", [0x25, 0x50, 0x44, 0x46]],
  ["planilha do Excel (.xlsx) ou arquivo compactado", [0x50, 0x4b, 0x03, 0x04]],
  ["planilha antiga do Excel (.xls)", [0xd0, 0xcf, 0x11, 0xe0]],
  ["imagem PNG", [0x89, 0x50, 0x4e, 0x47]],
  ["imagem JPEG", [0xff, 0xd8, 0xff]],
  ["imagem GIF", [0x47, 0x49, 0x46, 0x38]],
  ["arquivo compactado", [0x1f, 0x8b]],
  ["arquivo compactado", [0x52, 0x61, 0x72, 0x21]],
];

const PECA_CSV = "Exporte do Mailerfind em CSV (Prospects → Export CSV) e envie esse arquivo.";

export function decodificarCsv(bytes: Buffer): { texto: string } | { erro: string } {
  if (bytes.length > IMPORT_MAX_BYTES) return { erro: "Arquivo grande demais: o máximo é 5 MB." };
  if (!bytes.length) return { erro: "O arquivo está vazio." };
  for (const [nome, magico] of MAGICOS) {
    if (magico.every((b, i) => bytes[i] === b)) return { erro: `Este arquivo é ${nome}, não CSV. ${PECA_CSV}` };
  }
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    return { erro: "Arquivo em UTF-16 (\"Texto Unicode\" do Excel). Salve como \"CSV UTF-8\" e envie de novo." };
  }
  if (bytes.includes(0)) return { erro: `Este arquivo não é texto. ${PECA_CSV}` };
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // CSV salvo pelo Excel no Windows: Windows-1252 (latin1).
    texto = new TextDecoder("windows-1252").decode(bytes);
  }
  texto = texto.replace(/^﻿/, "");
  const controles = (texto.match(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g) ?? []).length;
  if (controles > Math.max(2, texto.length * 0.005)) return { erro: `Este arquivo não é texto. ${PECA_CSV}` };
  const inicio = texto.trimStart();
  if (/^[<{[]/.test(inicio)) return { erro: `Este arquivo é HTML, XML ou JSON, não CSV. ${PECA_CSV}` };
  const primeira = inicio.split(/\r?\n/, 1)[0] ?? "";
  if (!separadorDe(primeira)) return { erro: `Não encontrei colunas (separadas por vírgula ou ponto e vírgula). ${PECA_CSV}` };
  return { texto };
}

function separadorDe(cabecalho: string): string | undefined {
  const contar = (sep: string) => {
    let n = 0;
    let aspas = false;
    for (const c of cabecalho) {
      if (c === '"') aspas = !aspas;
      else if (c === sep && !aspas) n++;
    }
    return n;
  };
  const [melhor] = [",", ";", "\t"].map((s) => [s, contar(s)] as const).sort((a, b) => b[1] - a[1]);
  return melhor && melhor[1] > 0 ? melhor[0] : undefined;
}

// CSV (RFC 4180): aspas, aspas dobradas, quebra de linha dentro de aspas.
export function lerCsv(texto: string): string[][] {
  const sep = separadorDe(texto.split(/\r?\n/, 1)[0] ?? "") ?? ",";
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

// ------------------------------------------------------------- colunas

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const normCabecalho = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const EXATOS: Record<CampoImport, string[]> = {
  nome: ["full name", "nome", "name", "business name", "nome da empresa", "empresa", "title", "titulo", "company", "company name", "razao social", "nome fantasia", "place name", "business"],
  telefone: ["full phone number", "telefone", "phone", "phone number", "telefone 1", "phone 1", "international phone", "international phone number", "celular", "whatsapp", "fone", "tel"],
  email: ["email", "e mail", "emails", "e mails", "email 1", "email address", "correio eletronico"],
  site: ["site", "website", "web site", "site da empresa", "url do site", "domain", "dominio"],
  endereco: ["endereco", "address", "full address", "endereco completo", "street", "rua", "logradouro"],
  cidade: ["cidade", "city", "municipio", "town", "locality"],
  uf: ["uf", "estado", "state", "province"],
  categoria: ["categoria", "category", "categories", "categorias", "main category", "tipo", "type", "segmento", "ramo"],
  nota: ["nota", "rating", "avaliacao", "estrelas", "stars", "google rating", "nota google", "average rating", "nota media"],
  avaliacoes: ["avaliacoes", "reviews", "review count", "reviews count", "numero de avaliacoes", "total de avaliacoes", "qtd avaliacoes", "quantidade de avaliacoes", "num reviews", "user ratings total", "total reviews"],
  mapsUrl: ["location link", "google maps url", "maps url", "link do google maps", "google maps", "link google maps", "place url", "url do maps", "maps link", "link maps", "url google maps", "google maps link"],
  instagram: ["instagram", "instagram url", "perfil instagram"],
  facebook: ["facebook", "facebook url", "pagina facebook"],
  emailsExtras: ["all emails", "outros emails", "todos os emails", "other emails"],
  placeId: ["place id", "google place id", "id do lugar", "id do local"],
  situacao: ["business status", "status do negocio", "situacao"],
  telefoneAlt: ["phone number", "telefone 2", "phone 2", "phone", "telefone"],
};

// Segunda tentativa (parte do nome), na ordem: "maps" antes de "url"/"site".
const PARECIDOS: [CampoImport, RegExp, RegExp?][] = [
  ["mapsUrl", /maps/],
  ["instagram", /instagram/],
  ["facebook", /facebook/],
  ["email", /\be ?mails?\b/],
  ["telefone", /phone|telefone|fone|whats|celular/],
  ["avaliacoes", /(review|avaliac).*(count|total|numero|qtd|quant)|(count|total|numero|qtd|quant).*(review|avaliac)/],
  ["nota", /rating|nota|estrela/],
  ["site", /website|\bsite\b|\burl\b/],
  ["endereco", /endereco|address/],
  ["cidade", /cidade|city|municipio/],
  ["uf", /\buf\b|estado|state/],
  ["categoria", /categor/],
  ["nome", /nome|name|empresa|title|titulo/, /first|last|user|contato|contact|responsavel/],
];

export function detectarColunas(cabecalho: string[]): MapaColunas {
  const norm = cabecalho.map(normCabecalho);
  const mapa: MapaColunas = {};
  const usadas = new Set<number>();
  // A ordem dos sinônimos manda: "full_phone_number" (com DDI) ganha de
  // "phone_number"; cabeçalho repetido (ex.: "country" duas vezes) não atrapalha.
  for (const campo of Object.keys(EXATOS) as CampoImport[]) {
    for (const sinonimo of EXATOS[campo]) {
      const i = norm.findIndex((h, idx) => !usadas.has(idx) && h === sinonimo);
      if (i >= 0) {
        mapa[campo] = i;
        usadas.add(i);
        break;
      }
    }
  }
  for (const [campo, re, nao] of PARECIDOS) {
    if (mapa[campo] !== undefined) continue;
    const i = norm.findIndex((h, idx) => !usadas.has(idx) && re.test(h) && !(nao && nao.test(h)));
    if (i >= 0) {
      mapa[campo] = i;
      usadas.add(i);
    }
  }
  return mapa;
}

// ------------------------------------------------------------- valores

// Planilha abre "=...", "+...", "-...", "@..." (e tab/CR antes) como fórmula.
export function semFormula(valor: string): string {
  return valor.replace(/^[\s=+\-@]+/, "").trim();
}

function texto(valor: string | undefined, max: number): string | undefined {
  const limpo = semFormula((valor ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " "));
  return limpo ? limpo.slice(0, max).trim() : undefined;
}

export function normalizarTelefoneBr(valor: string | undefined): string | undefined {
  const bruto = (valor ?? "").trim();
  let d = bruto.replace(/\D/g, "");
  if (!d) return undefined;
  if (/^0(800|300|500|900)/.test(d)) return undefined;
  if (bruto.startsWith("+") && !d.startsWith("55")) return undefined; // estrangeiro
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  else if (d.startsWith("0")) {
    d = d.replace(/^0+/, "");
    if (d.length === 12 || d.length === 13) d = d.slice(2); // 0 + operadora + DDD + número
  }
  if (!/^[1-9][1-9]/.test(d)) return undefined;
  if (d.length === 11 && d[2] === "9") return `+55${d}`;
  if (d.length === 10 && /[2-5]/.test(d[2]!)) return `+55${d}`;
  return undefined;
}

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
export function normalizarEmail(valor: string | undefined): string | undefined {
  for (const parte of (valor ?? "").split(/[\s,;]+/)) {
    const v = parte.trim().toLowerCase().replace(/^mailto:/, "");
    if (v && v.length <= 200 && EMAIL_RE.test(v)) return v;
  }
  return undefined;
}

// Sites que não identificam a empresa (rede social, WhatsApp, buscadores,
// encurtadores, classificados): não contam como "mesmo site".
const SITES_GENERICOS = /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|wa\.me|whatsapp\.com|api\.whatsapp\.com|linktr\.ee|google\.[a-z.]+|goo\.gl|g\.page|youtube\.com|tiktok\.com|twitter\.com|x\.com|linkedin\.com|olx\.com\.br|webmotors\.com\.br|mercadolivre\.com\.br|icarros\.com\.br|bit\.ly|novoseminovo\.com\.br)$/;

function urlHttp(valor: string | undefined, max = 300): URL | undefined {
  let v = (valor ?? "").trim();
  if (!v || v.length > max) return undefined;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?([/?#].*)?$/i.test(v)) return undefined;
    v = `https://${v}`;
  }
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u : undefined;
  } catch {
    return undefined;
  }
}

export function dominioDoSite(valor: string | undefined): string | undefined {
  const u = urlHttp(valor);
  if (!u) return undefined;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  return host.includes(".") && !SITES_GENERICOS.test(host) ? host : undefined;
}

function siteLimpo(valor: string | undefined): string | undefined {
  const v = (valor ?? "").trim();
  const u = urlHttp(v);
  if (!u) return undefined;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function linkDe(valor: string | undefined, hosts: RegExp, max = 500): string | undefined {
  const v = (valor ?? "").trim();
  if (!/^https?:\/\//i.test(v)) return undefined;
  const u = urlHttp(v, max);
  return u && hosts.test(u.hostname.toLowerCase()) ? v : undefined;
}

function instagramDe(valor: string | undefined): string | undefined {
  const v = (valor ?? "").trim();
  if (!v) return undefined;
  let handle = v;
  if (/^https?:\/\//i.test(v)) {
    const u = urlHttp(v);
    if (!u || !/(^|\.)instagram\.com$/.test(u.hostname.toLowerCase())) return undefined;
    handle = u.pathname.split("/").filter(Boolean)[0] ?? "";
  }
  handle = handle.replace(/^@/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle.toLowerCase() : undefined;
}

function numeroBr(valor: string | undefined): number | undefined {
  const v = (valor ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(v)) return undefined;
  const n = Number(v);
  return n >= 0 && n <= 5 ? Math.round(n * 10) / 10 : undefined;
}

function inteiro(valor: string | undefined): number | undefined {
  const v = (valor ?? "").replace(/[()\s.]/g, "");
  if (!/^\d{1,8}$/.test(v)) return undefined;
  return Number(v);
}

// "Av. Amazonas, 1000 - Centro, Belo Horizonte - MG, 30180-001" → BH/MG.
function cidadeDoEndereco(endereco: string | undefined): { cidade?: string; uf?: string } {
  const m = (endereco ?? "").match(/(?:^|,)\s*([^,]+?)\s+-\s+([A-Z]{2})(?:\s*,\s*\d{5}-?\d{3})?(?:\s*,\s*Bra[sz]il)?\s*$/);
  if (!m || !UFS.has(m[2]!)) return {};
  return { cidade: m[1]!.trim(), uf: m[2] };
}

// ID do lugar no Google (place_id, ex.: "ChIJ..."): letras, números, - e _.
function placeIdDe(valor: string | undefined): string | undefined {
  const v = (valor ?? "").trim();
  return /^[A-Za-z0-9_-]{10,200}$/.test(v) ? v : undefined;
}

const UF_NOMES: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
  "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};
// "MG", "Minas Gerais" ou "State of Minas Gerais" → "MG".
function ufDe(valor: string | undefined): string | undefined {
  const v = semAcento(valor ?? "").trim();
  if (UFS.has(v.toUpperCase()) && v.length === 2) return v.toUpperCase();
  const nome = v.toLowerCase().replace(/^(state of|estado de|estado do|estado da)\s+/, "").replace(/\s+/g, " ");
  return UF_NOMES[nome];
}

// ------------------------------------------------------------- duplicadas

const PALAVRAS_SOCIETARIAS = new Set(["ltda", "me", "mei", "epp", "eireli", "sa", "s", "a", "cia"]);
const APELIDOS_CIDADE: Record<string, string> = { bh: "belo horizonte", sp: "sao paulo", rj: "rio de janeiro" };
export const normNome = (s: string) =>
  semAcento(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !PALAVRAS_SOCIETARIAS.has(w))
    .join(" ");
export const normCidade = (s: string) => {
  const c = semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return APELIDOS_CIDADE[c] ?? c;
};

export type TipoChave = "lugar" | "telefone" | "email" | "site" | "nome";
export const MOTIVO_CHAVE: Record<TipoChave, string> = { lugar: "mesmo lugar no Google Maps", telefone: "mesmo telefone", email: "mesmo e-mail", site: "mesmo site", nome: "mesmo nome e cidade" };

// Telefone sem o +55 (igual ao índice cego do banco), e-mail minúsculo,
// domínio do site, nome+cidade sem acento e sem "LTDA".
export function chavesDedup(e: { nome: string; cidade?: string; telefone?: string; email?: string; dominio?: string; placeId?: string }): string[] {
  const chaves: string[] = [];
  if (e.placeId) chaves.push(`lugar:${e.placeId}`);
  if (e.telefone) chaves.push(`telefone:${e.telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")}`);
  if (e.email) chaves.push(`email:${e.email.toLowerCase()}`);
  if (e.dominio) chaves.push(`site:${e.dominio}`);
  const nome = normNome(e.nome);
  const cidade = e.cidade ? normCidade(e.cidade) : "";
  if (nome && cidade) chaves.push(`nome:${nome}|${cidade}`);
  return chaves;
}
export const tipoDaChave = (chave: string) => chave.slice(0, chave.indexOf(":")) as TipoChave;

// ------------------------------------------------------------- análise

export function analisarCsv(bytes: Buffer): AnaliseCsv | { erro: string } {
  const decodificado = decodificarCsv(bytes);
  if ("erro" in decodificado) return decodificado;
  const todas = lerCsv(decodificado.texto);
  const cabecalho = (todas[0] ?? []).map((h) => texto(h, 80) ?? "");
  const registros = todas.slice(1).map((cols, i) => ({ cols, linha: i + 2 })).filter((r) => r.cols.some((c) => c.trim()));
  if (registros.length > IMPORT_MAX_LINHAS) return { erro: `O arquivo tem ${registros.length.toLocaleString("pt-BR")} empresas; o máximo por importação é 5.000. Divida o arquivo e envie em partes.` };
  if (!registros.length) return { erro: "O arquivo não tem nenhuma empresa (só o cabeçalho)." };
  const mapa = detectarColunas(cabecalho);
  if (mapa.nome === undefined) return { erro: "Não encontrei a coluna com o nome da empresa (ex.: \"Name\", \"Nome\", \"Business Name\")." };

  const validas: LinhaProspect[] = [];
  const invalidas: LinhaRecusada[] = [];
  const duplicadas: LinhaRecusada[] = [];
  const vistas = new Set<string>();
  let emailsDescartados = 0;
  for (const { cols, linha } of registros) {
    const col = (campo: CampoImport) => (mapa[campo] === undefined ? undefined : cols[mapa[campo]!]);
    const nome = texto(col("nome"), 120) ?? "";
    if (!nome) {
      invalidas.push({ linha, nome: "", motivo: "Sem nome da empresa" });
      continue;
    }
    if (/closed[_ ]?permanently|fechad[oa] permanentemente/i.test(col("situacao") ?? "")) {
      invalidas.push({ linha, nome, motivo: "Fechada permanentemente no Google" });
      continue;
    }
    const telefone = normalizarTelefoneBr(col("telefone")) ?? normalizarTelefoneBr(col("telefoneAlt"));
    const email = normalizarEmail(col("email")) ?? normalizarEmail(col("emailsExtras"));
    if (!email && ((col("email") ?? "").trim() || (col("emailsExtras") ?? "").trim())) emailsDescartados++;
    if (!telefone && !email) {
      invalidas.push({ linha, nome, motivo: "Sem telefone nem e-mail válido" });
      continue;
    }
    const endereco = texto(col("endereco"), 300);
    const doEndereco = cidadeDoEndereco(endereco);
    const ufColuna = ufDe(col("uf"));
    const l: LinhaProspect = {
      linha,
      nome,
      telefone,
      email,
      site: siteLimpo(col("site")),
      dominio: dominioDoSite(col("site")),
      endereco,
      cidade: texto(col("cidade"), 80) ?? doEndereco.cidade,
      uf: ufColuna ?? doEndereco.uf,
      categoria: texto(col("categoria"), 80),
      nota: numeroBr(col("nota")),
      avaliacoes: inteiro(col("avaliacoes")),
      mapsUrl: linkDe(col("mapsUrl"), /(^|\.)google\.[a-z.]+$|^maps\.app\.goo\.gl$|^goo\.gl$|^g\.page$/),
      instagram: instagramDe(col("instagram")),
      facebook: linkDe(col("facebook"), /(^|\.)(facebook\.com|fb\.com|fb\.me)$/),
      placeId: placeIdDe(col("placeId")),
    };
    for (const k of Object.keys(l) as (keyof LinhaProspect)[]) if (l[k] === undefined) delete l[k];
    const chaves = chavesDedup(l);
    const repetida = chaves.find((c) => vistas.has(c));
    if (repetida) {
      duplicadas.push({ linha, nome, motivo: `Repetida no arquivo: ${MOTIVO_CHAVE[tipoDaChave(repetida)]}` });
      continue;
    }
    chaves.forEach((c) => vistas.add(c));
    validas.push(l);
  }
  return { hash: createHash("sha256").update(bytes).digest("hex"), cabecalho, mapa, total: registros.length, validas, invalidas, duplicadas, emailsDescartados };
}

// ------------------------------------------------------------- relatório

// Célula de CSV segura para abrir no Excel: fórmula vira texto ('=...) e
// separador/aspas/quebra de linha vão entre aspas.
export function celulaCsv(valor: string | number): string {
  let v = String(valor);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function csvRelatorio(linhas: LinhaRecusada[]): string {
  return ["Linha;Empresa;Motivo", ...linhas.map((l) => [l.linha, l.nome, l.motivo].map(celulaCsv).join(";"))].join("\n") + "\n";
}

// Arquivo de imóveis (imobiliária ou corretor): a categoria do Google decide
// por linha. "Corretor de imóveis"/"real estate agent" = corretor; com
// "imobiliária"/"agency" na categoria = imobiliária. Sem categoria (ou arquivo
// de lojas/outro), fica o tipo escolhido na importação.
export function segmentoDaLinha<T extends string>(doArquivo: T, categoria?: string): T | "property" | "broker" {
  if (doArquivo !== "property" && doArquivo !== "broker") return doArquivo;
  const c = (categoria ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/imobiliari|real estate agency|agencia imobiliaria|realty/.test(c)) return "property";
  if (/corretor|real estate agent|broker/.test(c)) return "broker";
  return doArquivo;
}
