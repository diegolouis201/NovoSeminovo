// Botões de ação do painel do CRM: ligar, WhatsApp, e-mail, reunião e as
// mensagens prontas. Funções puras e sem dependências: o painel-html.mjs
// copia estas mesmas funções para dentro da página (o que é testado aqui é o
// que roda no navegador). Uma pessoa por vez: a mensagem só sai quando o
// Diego clica em enviar no WhatsApp ou no Gmail.

export function telefoneBr(valor) {
  let d = String(valor ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d.length === 12 || d.length === 13 ? d : null;
}

export function linkLigar(valor) {
  const d = telefoneBr(valor);
  return d ? "tel:+" + d : null;
}

export function linkWhatsApp(onde, telefone, texto) {
  const t = encodeURIComponent(texto ?? "");
  if (onde === "app") return "whatsapp://send?phone=" + telefone + "&text=" + t;
  if (onde === "web") return "https://web.whatsapp.com/send?phone=" + telefone + "&text=" + t;
  if (onde === "wame") return "https://wa.me/" + telefone + "?text=" + t;
  return "whatsapp-smb://send?phone=" + telefone + "&text=" + t;
}

// E-mail digitado à mão (empresa sem e-mail no cadastro): limpo e conferido,
// para não virar link com cópia oculta ou endereço quebrado.
export function emailValido(texto) {
  const v = String(texto ?? "").trim().toLowerCase();
  if (!v || v.length > 200) return null;
  return /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v) ? v : null;
}

export function linkEmail(onde, conta, para, assunto, corpo) {
  const e = encodeURIComponent;
  if (onde === "mailto") return "mailto:" + e(para) + "?subject=" + e(assunto ?? "") + "&body=" + e(corpo ?? "");
  return "https://mail.google.com/mail/?authuser=" + e(conta ?? "") + "&view=cm&fs=1&to=" + e(para) + "&su=" + e(assunto ?? "") + "&body=" + e(corpo ?? "");
}

// "2026-11-10" + "14:30" + 45 min -> ["20261110T143000", "20261110T151500"] (horário de Brasília)
export function horarioReuniao(data, hora, duracao) {
  const [a, m, d] = String(data).split("-").map(Number);
  const [h, mi] = String(hora).split(":").map(Number);
  const inicio = new Date(Date.UTC(a, m - 1, d, h, mi));
  const fim = new Date(inicio.getTime() + (Number(duracao) || 60) * 60000);
  const f = (x) => x.toISOString().slice(0, 19).replace(/[-:]/g, "");
  return [f(inicio), f(fim)];
}

export function linkAgenda(conta, r) {
  const [ini, fim] = horarioReuniao(r.data, r.hora, r.duracao);
  const p = new URLSearchParams({ authuser: conta ?? "", action: "TEMPLATE", text: r.titulo ?? "", dates: ini + "/" + fim, ctz: "America/Sao_Paulo", details: r.pauta ?? "", location: r.local ?? "" });
  return "https://calendar.google.com/calendar/render?" + p.toString();
}

export function convidarIcs(r, agoraIso) {
  const [ini, fim] = horarioReuniao(r.data, r.hora, r.duracao);
  const t = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const stamp = String(agoraIso ?? new Date().toISOString()).replace(/[-:]/g, "").replace(/\.\d+/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NovoSeminovo//CRM//PT-BR",
    "BEGIN:VEVENT",
    "UID:" + ini + "-" + Math.abs(String(r.titulo).split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) + "@novoseminovo",
    "DTSTAMP:" + stamp,
    "DTSTART;TZID=America/Sao_Paulo:" + ini,
    "DTEND;TZID=America/Sao_Paulo:" + fim,
    "SUMMARY:" + t(r.titulo),
    "LOCATION:" + t(r.local),
    "DESCRIPTION:" + t(r.pauta),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export const CAMPOS_MENSAGEM = ["responsavel", "empresa", "cidade", "seunome", "fimgratis", "leadsparados", "link"];

export function preencherMensagem(texto, dados) {
  const faltando = [];
  const valor = (campo) => {
    let v = dados ? dados[campo] : undefined;
    if (campo === "responsavel" && v) v = String(v).trim().split(/\s+/)[0];
    return v === undefined || v === null || v === "" ? null : String(v);
  };
  const saida = String(texto ?? "").replace(/\{(\w+)\}/g, (inteiro, campo) => {
    if (CAMPOS_MENSAGEM.indexOf(campo) < 0) return inteiro;
    const v = valor(campo);
    if (v === null) {
      if (faltando.indexOf(campo) < 0) faltando.push(campo);
      return "___";
    }
    return v;
  });
  return { texto: saida, faltando };
}

// Mensagens iniciais (o Diego pode editar em Configurações). Nunca falar de
// preço nem de desconto: preço é sempre o de tabela.
export const MENSAGENS_INICIAIS = [
  { nome: "Primeiro contato", canal: "ambos", publico: "todos", assunto: "{empresa} no NovoSeminovo", texto: "Olá, {responsavel}! Aqui é {seunome}, do NovoSeminovo, o marketplace de carros e imóveis com anúncios em todo o Brasil. Vi o trabalho da {empresa} em {cidade} e acredito que seus anúncios teriam ótima vitrine com a gente. Posso te mostrar como funciona em 10 minutos?" },
  { nome: "Boas-vindas", canal: "ambos", publico: "todos", assunto: "Bem-vinda ao NovoSeminovo, {empresa}!", texto: "Olá, {responsavel}! Seja bem-vinda ao NovoSeminovo. Sua página já está no ar: {link}. Qualquer dúvida para publicar os anúncios, é só me chamar por aqui." },
  { nome: "Período grátis acabando", canal: "ambos", publico: "todos", assunto: "Seu período grátis vai até {fimgratis}", texto: "Olá, {responsavel}! O período grátis da {empresa} no NovoSeminovo vai até {fimgratis}. Para os anúncios continuarem no ar, é só escolher o plano no painel. Quer que eu te ajude a ver qual plano cabe no seu estoque?" },
  { nome: "Leads parados", canal: "ambos", publico: "todos", assunto: "Clientes esperando resposta na {empresa}", texto: "Olá, {responsavel}! A {empresa} tem {leadsparados} clientes esperando resposta no NovoSeminovo há mais de 3 dias. Responder rápido faz muita diferença na venda. Posso te ajudar a ver esses contatos no painel?" },
  { nome: "Sumiu do painel", canal: "ambos", publico: "todos", assunto: "Sentimos sua falta no NovoSeminovo", texto: "Olá, {responsavel}! Faz um tempo que a {empresa} não entra no painel do NovoSeminovo. Está tudo certo? Se precisar de ajuda com os anúncios ou com os contatos dos clientes, estou à disposição." },
  { nome: "Lojas: destaque dos carros", canal: "ambos", publico: "vehicle", assunto: "Dica para os carros da {empresa} aparecerem mais", texto: "Olá, {responsavel}! Uma dica para os carros da {empresa} aparecerem mais: fotos com boa luz, o carro inteiro na primeira foto e a versão FIPE preenchida. Se quiser, olho os seus anúncios com você." },
  { nome: "Imóveis: captação", canal: "ambos", publico: "property", assunto: "Mais visibilidade para os imóveis da {empresa}", texto: "Olá, {responsavel}! No NovoSeminovo, quem procura imóvel em {cidade} vê os anúncios no mapa, em tempo real. Quer que eu te mostre como deixar os imóveis da {empresa} com mais destaque na busca?" },
  { nome: "Pedir indicação", canal: "ambos", publico: "todos", assunto: "Você indicaria o NovoSeminovo?", texto: "Olá, {responsavel}! Que bom ter a {empresa} com a gente. Você conhece outra loja, imobiliária ou corretor que gostaria de anunciar no NovoSeminovo? Uma indicação sua ajuda muito." },
  { nome: "Depois da reunião", canal: "ambos", publico: "todos", assunto: "Obrigado pela conversa, {responsavel}", texto: "Olá, {responsavel}! Obrigado pela conversa de hoje. Como combinamos, seguem os próximos passos para a {empresa}: ___. Qualquer dúvida, é só me chamar." },
];
