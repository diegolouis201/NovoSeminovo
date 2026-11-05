// Testes dos botões de ação do painel (ligar, WhatsApp, e-mail, reunião) e das
// mensagens prontas. Rodar: node --test scripts/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMPOS_MENSAGEM, MENSAGENS_INICIAIS, convidarIcs, linkAgenda, linkEmail, linkLigar, linkWhatsApp, preencherMensagem, telefoneBr } from "./painel-acoes.mjs";

test("telefone: só dígitos, com 55 na frente quando tem DDD + número", () => {
  assert.equal(telefoneBr("(31) 98888-7777"), "5531988887777");
  assert.equal(telefoneBr("31 3333-4444"), "553133334444");
  assert.equal(telefoneBr("+55 31 98888-7777"), "5531988887777");
  assert.equal(telefoneBr("123"), null);
  assert.equal(telefoneBr(undefined), null);
  assert.equal(linkLigar("(31) 98888-7777"), "tel:+5531988887777");
});

test("WhatsApp: Business do computador por padrão; normal, Web e wa.me como opção", () => {
  const t = "Olá, Ana & cia!";
  assert.equal(linkWhatsApp("smb", "5531988887777", t), "whatsapp-smb://send?phone=5531988887777&text=Ol%C3%A1%2C%20Ana%20%26%20cia!");
  assert.equal(linkWhatsApp("app", "5531988887777", "oi"), "whatsapp://send?phone=5531988887777&text=oi");
  assert.equal(linkWhatsApp("web", "5531988887777", "oi"), "https://web.whatsapp.com/send?phone=5531988887777&text=oi");
  assert.equal(linkWhatsApp("wame", "5531988887777", "oi"), "https://wa.me/5531988887777?text=oi");
});

test("e-mail: Gmail na conta da empresa ou mailto", () => {
  assert.equal(
    linkEmail("gmail", "diego.louis@novoseminovo.com.br", "loja@x.com", "Assunto & teste", "Linha 1\nLinha 2"),
    "https://mail.google.com/mail/?authuser=diego.louis%40novoseminovo.com.br&view=cm&fs=1&to=loja%40x.com&su=Assunto%20%26%20teste&body=Linha%201%0ALinha%202",
  );
  assert.equal(linkEmail("mailto", "", "loja@x.com", "Oi", "Texto"), "mailto:loja%40x.com?subject=Oi&body=Texto");
});

test("reunião: Google Agenda no horário de Brasília e convite .ics", () => {
  const r = { titulo: "Reunião Loja X", data: "2026-11-10", hora: "14:30", duracao: 45, local: "Google Meet", pauta: "Plano; destaque, dúvidas" };
  const g = new URL(linkAgenda("diego.louis@novoseminovo.com.br", r));
  assert.equal(g.origin + g.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(g.searchParams.get("action"), "TEMPLATE");
  assert.equal(g.searchParams.get("authuser"), "diego.louis@novoseminovo.com.br");
  assert.equal(g.searchParams.get("dates"), "20261110T143000/20261110T151500");
  assert.equal(g.searchParams.get("ctz"), "America/Sao_Paulo");
  assert.equal(g.searchParams.get("text"), "Reunião Loja X");
  const ics = convidarIcs(r, "2026-11-04T12:00:00Z");
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /DTSTART;TZID=America\/Sao_Paulo:20261110T143000/);
  assert.match(ics, /DTEND;TZID=America\/Sao_Paulo:20261110T151500/);
  assert.match(ics, /DESCRIPTION:Plano\\; destaque\\, dúvidas/);
});

test("mensagem pronta: preenche os campos e avisa o que faltou", () => {
  const r = preencherMensagem("Oi, {responsavel}! A {empresa} de {cidade} tem {leadsparados} clientes esperando. Até {fimgratis}. {seunome}", {
    responsavel: "Maria Souza",
    empresa: "Loja X",
    cidade: "Contagem",
    leadsparados: 3,
    seunome: "Diego",
  });
  assert.equal(r.texto, "Oi, Maria! A Loja X de Contagem tem 3 clientes esperando. Até ___. Diego");
  assert.deepEqual(r.faltando, ["fimgratis"]);
});

test("mensagens iniciais: sem preço, desconto ou %, e só com os campos conhecidos", () => {
  assert.ok(MENSAGENS_INICIAIS.length >= 9);
  const nomes = MENSAGENS_INICIAIS.map((m) => m.nome);
  for (const n of ["Primeiro contato", "Boas-vindas", "Período grátis acabando", "Leads parados", "Sumiu do painel", "Lojas: destaque dos carros", "Imóveis: captação", "Pedir indicação", "Depois da reunião"]) {
    assert.ok(nomes.includes(n), n);
  }
  for (const m of MENSAGENS_INICIAIS) {
    const tudo = `${m.assunto ?? ""} ${m.texto}`;
    assert.doesNotMatch(tudo, /R\$|desconto|%/i, m.nome);
    assert.doesNotMatch(tudo, /Minas|\bMG\b|Belo Horizonte|\bBH\b/i, `${m.nome}: a empresa atua no Brasil todo`);
    for (const [, campo] of tudo.matchAll(/\{(\w+)\}/g)) assert.ok(CAMPOS_MENSAGEM.includes(campo), `${m.nome}: {${campo}}`);
    assert.ok(["whatsapp", "email", "ambos"].includes(m.canal), m.nome);
    assert.ok(["todos", "vehicle", "property"].includes(m.publico), m.nome);
  }
  assert.equal(MENSAGENS_INICIAIS.find((m) => m.nome === "Lojas: destaque dos carros").publico, "vehicle");
  assert.equal(MENSAGENS_INICIAIS.find((m) => m.nome === "Imóveis: captação").publico, "property");
});
