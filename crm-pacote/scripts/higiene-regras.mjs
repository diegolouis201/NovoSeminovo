// Higiene de dados: o que está faltando, errado, duplicado ou abandonado na
// base. Dado ruim gera relatório errado — rodar todo mês (ver CLAUDE.md).
import { daysBetween } from "./lib.mjs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const digits = (v) => String(v ?? "").replace(/\D/g, "");
const CARD_ESQUECIDO_DIAS = 60;

export function checkHygiene(feed, marcacoes = {}, hoje = new Date()) {
  const out = [];
  const add = (tipo, nome, texto, id) => out.push({ tipo, empresa: nome, texto, id });

  for (const e of feed.empresas ?? []) {
    if (!e.cidade) add("sem_cidade", e.nome, `${e.nome}: sem cidade.`, e.id);
    if (!e.responsavel?.telefone) add("sem_telefone", e.nome, `${e.nome}: responsável sem telefone.`, e.id);
    if (e.responsavel?.email && !EMAIL.test(e.responsavel.email)) add("email_invalido", e.nome, `${e.nome}: e-mail do responsável parece inválido.`, e.id);
    if (!e.setor && !e.abertaEm) add("receita_pendente", e.nome, `${e.nome}: dados da Receita ainda não carregados (setor, abertura, sócios).`, e.id);
    if (!e.vendedor) add("sem_dono", e.nome, `${e.nome}: card sem vendedor responsável.`, e.id);
    if (marcacoes[e.id]?.importante && !(e.socios ?? []).some((s) => s.aniversario)) {
      add("importante_sem_aniversario", e.nome, `${e.nome} (importante): nenhum aniversário de sócio preenchido.`, e.id);
    }
  }

  for (const p of feed.prospeccao ?? []) {
    if (!p.telefone && !p.email) add("sem_contato", p.nome, `${p.nome}: card sem telefone nem e-mail.`, p.cardId);
    if (p.email && !EMAIL.test(p.email)) add("email_invalido", p.nome, `${p.nome}: e-mail parece inválido.`, p.cardId);
    if (!p.vendedor) add("sem_dono", p.nome, `${p.nome}: card sem vendedor responsável.`, p.cardId);
    const criado = p.criadoEm ? new Date(p.criadoEm) : undefined;
    if (p.etapa?.id === "a_abordar" && criado && daysBetween(criado, hoje) > CARD_ESQUECIDO_DIAS) {
      add("card_esquecido", p.nome, `${p.nome}: em "A abordar" há ${daysBetween(criado, hoje)} dias. Abordar ou marcar como perdida.`, p.cardId);
    }
  }

  // Duplicados: mesmo CNPJ ou mesmo telefone em mais de um registro.
  const seen = new Map();
  const register = (key, nome, id) => {
    if (!key) return;
    const prev = seen.get(key);
    if (prev && prev.id !== id) add("duplicado", nome, `Possível duplicado: "${prev.nome}" e "${nome}".`, id);
    else seen.set(key, { nome, id });
  };
  for (const e of feed.empresas ?? []) {
    register(digits(e.cnpj) && `cnpj:${digits(e.cnpj)}`, e.nome, e.id);
    register(digits(e.responsavel?.telefone).slice(-11) && `tel:${digits(e.responsavel?.telefone).slice(-11)}`, e.nome, e.id);
  }
  for (const p of feed.prospeccao ?? []) {
    register(digits(p.telefone).slice(-11) && `tel:${digits(p.telefone).slice(-11)}`, p.nome, p.cardId);
  }

  // Marcação de empresa/card que não existe mais.
  const ids = new Set([...(feed.empresas ?? []).flatMap((e) => [e.id, e.cardId]), ...(feed.prospeccao ?? []).map((p) => p.cardId)]);
  for (const [id, mark] of Object.entries(marcacoes)) {
    if (!ids.has(id)) add("marcacao_orfa", mark.nome ?? id, `Marcação de "${mark.nome ?? id}" aponta para empresa que não está mais no CRM.`, id);
  }
  return out;
}
