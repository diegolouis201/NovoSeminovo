// Teste da integração com a Creditas (Autofin C2C, homologação) direto do
// servidor, sem passar pelo site. Node 20 puro, sem dependências.
//
// Uso (no servidor, dentro de ~/NovoSeminovo):
//   docker run --rm -v ~/NovoSeminovo/scripts:/s -v ~/NovoSeminovo/secrets:/secrets:ro -w /s \
//     node:20-alpine node creditas-teste.mjs /s/creditas-lead-teste.json            (só testa o login)
//   ... node creditas-teste.mjs /s/creditas-lead-teste.json --enviar                 (cria um lead de teste)
//
// Lê as chaves de /secrets/creditas_consumer_key e /secrets/creditas_consumer_secret
// e NUNCA mostra chave nem token: só "token ok (expira em Ns)".
// O arquivo do lead (creditas-lead-teste.json) tem dados reais e fica só no
// servidor (está no .gitignore). Modelo: creditas-lead-teste.exemplo.json.
// O termo BACEN abaixo é o mesmo do site (packages/shared-types/src/creditas-termo.ts,
// conferido por teste automático em apps/api/src/agents/creditas-termo.spec.ts).
// No JSON, deixe "authorizationTerm" vazio ou "__TERMO_IBS__" que o script
// coloca este.
import { readFileSync } from "node:fs";

const TERMO = "Eu estou ciente e autorizo, neste ato que a IBS CAPITAL CORRETORA DE SEGUROS LTDA, correspondente de instituições financeiras nos termos da resolução CMN nº 3.954/2011, sociedade constituída e existente de acordo com as leis do Brasil e inscrita no CNPJ/MF sob o nº 61.452.517/0001-06, doravante denominada IBS Capital, tenha acesso e consulte de forma própria ou através de seus PARCEIROS*: a) Os meus débitos e responsabilidades decorrentes de operações com características de crédito e as informações e os registros de medidas judiciais que em meu nome constem ou venham a constar do Sistema de Informações de Crédito (SCR), gerido pelo Banco Central do Brasil BACEN, ou dos sistemas que venham a complementá-lo ou a substituí-lo. b) Informações a meu respeito constantes nos cadastros dos órgãos de proteção ao crédito tais como SPC, Serasa e BVS; AUTORIZO expressamente IBS Capital a divulgar, compartilhar e trocar informações a meu respeito com seus PARCEIROS* ou qualquer outro terceiro a ele ligado ou relacionado, para fins de registro, análise de risco de crédito e qualquer outra finalidade, incluindo, mas não limitado a comercialização de produtos do PARCEIROS* ou do respectivo terceiro. Estou ciente de que: a) O SCR tem por finalidades fornecer informações ao BACEN para fins de supervisão do risco de crédito a que estão expostas as instituições financeiras e propiciar o intercâmbio de informações entre essas instituições com o objetivo de subsidiar decisões de crédito e de negócios; b) poderei ter acesso aos dados constantes em meu nome no SCR por meio da Central de Atendimento ao Público do Banco Central do Brasil (CAP); c) pedidos de correções, de exclusões e de manifestações de discordância quanto às informações constantes do SCR deverão ser dirigidas ao BACEN ou à instituição responsável pela remessa das informações, por meio de requerimento escrito e fundamentado, ou, quando for o caso, pela respectiva decisão judicial; d) a consulta sobre qualquer informação ao SCR depende de minha prévia autorização; e) mais informações sobre o SCR podem ser obtidas em consulta a página na Internet do Banco Central: www.bcb.gov.br.";

const AUTH_URL = (process.env.CREDITAS_AUTH_URL || "https://auth-staging.creditas.com.br").replace(/\/+$/, "");
const API_URL = (process.env.CREDITAS_API_URL || "https://stg-api.creditas.io").replace(/\/+$/, "");
const SECRETS = (process.env.CREDITAS_SECRETS_DIR || "/secrets").replace(/\/+$/, "");

const [arquivo, flag] = process.argv.slice(2);
const enviar = flag === "--enviar";

function lerSegredo(nome) {
  try {
    const valor = readFileSync(`${SECRETS}/${nome}`, "utf8").trim();
    if (!valor) throw new Error("vazio");
    return valor;
  } catch {
    console.error(`ERRO: não consegui ler ${SECRETS}/${nome}. Crie o arquivo ~/NovoSeminovo/secrets/${nome} (chmod 600).`);
    process.exit(1);
  }
}

const key = lerSegredo("creditas_consumer_key");
const secret = lerSegredo("creditas_consumer_secret");
let token = "";

// Nada que sai na tela pode conter a chave, o segredo ou o token.
function limpar(texto) {
  let t = String(texto);
  for (const s of [key, secret, token]) if (s && s.length >= 4) t = t.split(s).join("***");
  return t.replace(/Bearer\s+[^\s"',;]+/gi, "Bearer ***").slice(0, 500);
}

async function post(url, headers, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await res.text().catch(() => "");
  let json = {};
  try {
    json = texto ? JSON.parse(texto) : {};
  } catch {
    json = {};
  }
  return { status: res.status, texto, json };
}

try {
  const auth = await post(`${AUTH_URL}/api/affiliate_clients/tokens`, { "Accept-Version": "v1" }, { consumer_key: key, consumer_secret: secret });
  token = typeof auth.json.access_token === "string" ? auth.json.access_token : "";
  if (auth.status < 200 || auth.status >= 300 || !token) {
    console.error(`ERRO: login na Creditas recusado (HTTP ${auth.status}). Confira as chaves em secrets/.`);
    process.exit(1);
  }
  console.log(`token ok (expira em ${Number(auth.json.expires_in) || "?"}s)`);

  if (!enviar) {
    console.log("Para enviar o lead de teste, rode de novo com --enviar no final.");
    process.exit(0);
  }
  if (!arquivo) {
    console.error("ERRO: informe o arquivo do lead, ex.: /s/creditas-lead-teste.json");
    process.exit(1);
  }
  const lead = JSON.parse(readFileSync(arquivo, "utf8"));
  lead.lead = lead.lead ?? {};
  lead.lead.cpf = String(lead.lead.cpf ?? "").replace(/\D/g, "");
  lead.lead.phone = String(lead.lead.phone ?? "").replace(/\D/g, "");
  lead.bacenAuthorization = lead.bacenAuthorization ?? {};
  const termo = lead.bacenAuthorization.authorizationTerm;
  if (!termo || termo === "__TERMO_IBS__") lead.bacenAuthorization.authorizationTerm = TERMO;

  const res = await post(`${API_URL}/b2b/autofin-c2c/leads`, { Authorization: `Bearer ${token}` }, lead);
  console.log(`HTTP ${res.status}`);
  if (res.status >= 200 && res.status < 300 && typeof res.json.id === "string") console.log(`id do lead: ${res.json.id}`);
  else console.log(`resposta: ${limpar(res.texto) || "(vazia)"}`);
} catch (error) {
  console.error(`ERRO: ${limpar(error instanceof Error ? error.message : error)}`);
  process.exit(1);
}
