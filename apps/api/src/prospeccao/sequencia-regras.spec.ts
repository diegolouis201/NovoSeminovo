import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ProspeccaoSequenciaSchema, ProspeccaoAjustesSchema, SEQUENCIA_LOJAS_BH, PROSPECCAO_RODAPE, classifyAcquisition, ACQUISITION_SOURCES } from "@novoseminovo/shared-types";
import { agendarPasso, dentroDoHorario, inicioDoDiaBr, intervaloEntreEnvios, motivoParaParar, podeEnviar, proximoHorarioUtil, renderizarEmail } from "./sequencia-regras";

// Sequência de e-mails de prospecção pelo CRM: só seg–sex 9h–17h (Brasília),
// com teto por dia, intervalo aleatório de pelo menos 2 minutos, para quando a
// empresa responde, sai, muda de etapa ou vira parceira; todo e-mail leva o
// rodapé legal com o link de saída.

const br = (iso: string) => new Date(`${iso}-03:00`);

describe("Prospecção: horário de envio (America/Sao_Paulo)", () => {
  test("seg–sex das 9h às 17h; fim de semana e fora do horário não", () => {
    assert.equal(dentroDoHorario(br("2026-11-18T09:00:00")), true, "quarta 9h");
    assert.equal(dentroDoHorario(br("2026-11-18T16:59:00")), true);
    assert.equal(dentroDoHorario(br("2026-11-18T17:00:00")), false, "17h já fechou");
    assert.equal(dentroDoHorario(br("2026-11-18T08:59:00")), false);
    assert.equal(dentroDoHorario(br("2026-11-21T10:00:00")), false, "sábado");
    assert.equal(dentroDoHorario(br("2026-11-22T10:00:00")), false, "domingo");
    assert.equal(dentroDoHorario(new Date("2026-11-18T12:30:00Z")), true, "9h30 em Brasília");
  });

  test("próximo horário útil", () => {
    assert.equal(proximoHorarioUtil(br("2026-11-18T10:00:00")).toISOString(), br("2026-11-18T10:00:00").toISOString(), "já dentro: mesmo instante");
    assert.equal(proximoHorarioUtil(br("2026-11-18T07:00:00")).toISOString(), br("2026-11-18T09:00:00").toISOString());
    assert.equal(proximoHorarioUtil(br("2026-11-18T18:00:00")).toISOString(), br("2026-11-19T09:00:00").toISOString());
    assert.equal(proximoHorarioUtil(br("2026-11-20T17:30:00")).toISOString(), br("2026-11-23T09:00:00").toISOString(), "sexta à noite → segunda");
    assert.equal(proximoHorarioUtil(br("2026-11-21T11:00:00")).toISOString(), br("2026-11-23T09:00:00").toISOString(), "sábado → segunda");
  });

  test("espera em dias entre os passos, caindo em horário útil", () => {
    assert.equal(agendarPasso(br("2026-11-18T10:15:00"), 3).toISOString(), br("2026-11-23T09:00:00").toISOString(), "quarta + 3 = sábado → segunda 9h");
    assert.equal(agendarPasso(br("2026-11-16T10:15:00"), 3).toISOString(), br("2026-11-19T10:15:00").toISOString(), "segunda + 3 = quinta, mesmo horário");
    assert.equal(agendarPasso(br("2026-11-19T16:40:00"), 4).toISOString(), br("2026-11-23T16:40:00").toISOString(), "quinta + 4 = segunda");
    assert.equal(agendarPasso(br("2026-11-18T20:00:00"), 0).toISOString(), br("2026-11-19T09:00:00").toISOString(), "passo 1 agendado fora do horário");
  });

  test("início do dia em Brasília (para o teto diário)", () => {
    assert.equal(inicioDoDiaBr(new Date("2026-11-19T02:00:00Z")).toISOString(), br("2026-11-18T00:00:00").toISOString(), "23h do dia 18 em Brasília");
  });
});

describe("Prospecção: teto, intervalo e pausa", () => {
  const base = { agora: br("2026-11-18T10:00:00"), enviadosHoje: 0, limite: 25, pausado: false, liberadoApos: undefined as Date | undefined };
  test("pode enviar dentro do horário, abaixo do teto, depois do intervalo", () => {
    assert.deepEqual(podeEnviar(base), { ok: true });
    assert.deepEqual(podeEnviar({ ...base, pausado: true }), { ok: false, motivo: "pausado" });
    assert.deepEqual(podeEnviar({ ...base, agora: br("2026-11-21T10:00:00") }), { ok: false, motivo: "fora_do_horario" });
    assert.deepEqual(podeEnviar({ ...base, enviadosHoje: 25 }), { ok: false, motivo: "teto_do_dia" });
    assert.deepEqual(podeEnviar({ ...base, liberadoApos: br("2026-11-18T10:01:00") }), { ok: false, motivo: "intervalo" });
    assert.deepEqual(podeEnviar({ ...base, liberadoApos: br("2026-11-18T09:59:00") }), { ok: true });
  });

  test("intervalo aleatório entre envios: nunca menos de 2 minutos (até 6)", () => {
    assert.equal(intervaloEntreEnvios(() => 0), 120_000);
    assert.equal(intervaloEntreEnvios(() => 0.999999), 359_999);
    for (let i = 0; i < 200; i++) {
      const ms = intervaloEntreEnvios();
      assert.ok(ms >= 120_000 && ms < 360_000);
    }
  });

  test("teto diário: padrão 25, máximo 50", () => {
    assert.equal(ProspeccaoAjustesSchema.parse({}).limiteDiario, 25);
    assert.equal(ProspeccaoAjustesSchema.safeParse({ limiteDiario: 51 }).success, false);
    assert.equal(ProspeccaoAjustesSchema.safeParse({ limiteDiario: 0 }).success, false);
    assert.equal(ProspeccaoAjustesSchema.parse({ limiteDiario: 50 }).limiteDiario, 50);
  });
});

describe("Prospecção: quando a sequência para", () => {
  const card = { stage: "a_abordar", repliedAt: null, optedOutAt: null, partnerId: null, email: "a@b.com" };
  test("respondeu, saiu, mudou de etapa, virou parceira, não contatar, lista de bloqueio, sem e-mail", () => {
    assert.equal(motivoParaParar(card, { suprimido: false, naoContatar: false }), undefined);
    assert.equal(motivoParaParar({ ...card, repliedAt: new Date() }, { suprimido: false, naoContatar: false }), "respondeu");
    assert.equal(motivoParaParar({ ...card, optedOutAt: new Date() }, { suprimido: false, naoContatar: false }), "saiu");
    assert.equal(motivoParaParar(card, { suprimido: true, naoContatar: false }), "saiu");
    assert.equal(motivoParaParar(card, { suprimido: false, naoContatar: true }), "saiu");
    assert.equal(motivoParaParar({ ...card, stage: "em_contato" }, { suprimido: false, naoContatar: false }), "mudou_etapa");
    assert.equal(motivoParaParar({ ...card, partnerId: "p1" }, { suprimido: false, naoContatar: false }), "virou_parceira");
    assert.equal(motivoParaParar({ ...card, email: null }, { suprimido: false, naoContatar: false }), "sem_email");
  });
});

describe("Prospecção: texto do e-mail", () => {
  const link = "https://novoseminovo.com.br/sair/abc.def";
  test("placeholders, rodapé legal e link de saída sempre presentes (texto e HTML)", () => {
    const passo = SEQUENCIA_LOJAS_BH.passos[0]!;
    const e = renderizarEmail(passo, { empresa: "Auto <Teste> & Cia", cidade: "Belo Horizonte" }, { linkSair: link, numero: 1 });
    assert.equal(e.assunto, "Estoque da Auto <Teste> & Cia no NovoSeminovo, 3 meses grátis");
    assert.ok(e.texto.includes(PROSPECCAO_RODAPE.antes) && e.texto.includes(link) && e.texto.includes("responda SAIR"));
    const x = renderizarEmail({ assunto: "Oi", corpo: "Olá, {{empresa}} de {{cidade}}! <script>alert(1)</script>", esperaDias: 0 }, { empresa: "Auto <Teste> & Cia", cidade: "Belo Horizonte" }, { linkSair: link, numero: 1 });
    assert.ok(x.html.includes("Olá, Auto &lt;Teste&gt; &amp; Cia de Belo Horizonte!"), "HTML escapado");
    assert.ok(!x.html.includes("<Teste>") && !x.html.includes("<script>"));
    assert.ok(x.texto.startsWith("Olá, Auto <Teste> & Cia de Belo Horizonte!"), "texto puro sem escape");
    assert.ok(e.html.includes(`<a href="${link}"`) && e.html.includes("Clique aqui para sair"));
    assert.ok(e.html.includes('href="https://novoseminovo.com.br/para-lojas/comecar?utm_source=prospeccao&amp;utm_medium=email&amp;utm_campaign=prospeccao-lojas-bh"'), "link do corpo vira link http(s)");
    assert.ok(e.html.includes("CNPJ 60.327.011/0001-02"));
  });

  test("passos seguintes sem assunto continuam a conversa (Re: assunto do 1º)", () => {
    const e = renderizarEmail(SEQUENCIA_LOJAS_BH.passos[1]!, { empresa: "Loja X" }, { linkSair: link, numero: 2, assuntoPrimeiro: "Estoque da Loja X no NovoSeminovo, 3 meses grátis" });
    assert.equal(e.assunto, "Re: Estoque da Loja X no NovoSeminovo, 3 meses grátis");
    assert.ok(e.texto.includes(link));
  });

  test("sequência validada: até 3 passos, placeholder só {{empresa}}/{{cidade}}, link só http(s), tamanho máximo", () => {
    assert.equal(ProspeccaoSequenciaSchema.safeParse(SEQUENCIA_LOJAS_BH).success, true);
    const p = (corpo: string, assunto = "Oi") => ({ nome: "Teste", passos: [{ assunto, corpo, esperaDias: 0 }] });
    assert.equal(ProspeccaoSequenciaSchema.safeParse(p("Olá {{responsavel}}")).success, false);
    assert.equal(ProspeccaoSequenciaSchema.safeParse(p("veja javascript:alert(1)")).success, false);
    assert.equal(ProspeccaoSequenciaSchema.safeParse(p("veja data:text/html,oi")).success, false);
    assert.equal(ProspeccaoSequenciaSchema.safeParse(p("x".repeat(5001))).success, false);
    assert.equal(ProspeccaoSequenciaSchema.safeParse(p("ok", "")).success, false, "1º passo precisa de assunto");
    const quatro = { nome: "T", passos: Array.from({ length: 4 }, (_, i) => ({ assunto: "a", corpo: "b", esperaDias: i ? 2 : 0 })) };
    assert.equal(ProspeccaoSequenciaSchema.safeParse(quatro).success, false);
    assert.equal(ProspeccaoSequenciaSchema.safeParse({ nome: "T", passos: [{ assunto: "a", corpo: "b", esperaDias: 0 }, { assunto: "", corpo: "c", esperaDias: 0 }] }).success, false, "espera de 1 a 30 dias");
  });

  test("textos aprovados do Diego no rascunho \"Lojas BH\" (3 passos: dia 0, +3, +4)", () => {
    assert.equal(SEQUENCIA_LOJAS_BH.nome, "Lojas BH");
    assert.deepEqual(SEQUENCIA_LOJAS_BH.passos.map((p) => p.esperaDias), [0, 3, 4]);
    assert.ok(SEQUENCIA_LOJAS_BH.passos[0]!.corpo.startsWith("Olá, tudo bem?\n\nSou o Diego, do NovoSeminovo"));
    assert.ok(SEQUENCIA_LOJAS_BH.passos[2]!.corpo.startsWith("Último contato sobre isso, prometo. 🙂"));
  });
});

describe("Prospecção: origem do cadastro (UTM)", () => {
  test("utm_source=prospeccao vira a origem \"Prospecção por e-mail\" com a campanha", () => {
    const a = classifyAcquisition({ utmSource: "prospeccao", utmMedium: "email", utmCampaign: "prospeccao-lojas-bh" });
    assert.deepEqual(a, { source: "prospeccao", medium: "email", campaign: "prospeccao-lojas-bh" });
    assert.ok(ACQUISITION_SOURCES.prospeccao);
  });
});
