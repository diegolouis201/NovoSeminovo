import {
  JORNADA_MARCOS,
  JORNADA_NIVEIS,
  JORNADA_REDES_LISTA,
  type HubJornada,
  type JornadaMarco,
  type JornadaPremissas,
  type JornadaRede,
  type JornadaRedeAtual,
} from "@novoseminovo/shared-types";

// Jornada do Hub: regras puras (testes em jornada.spec.ts).
// Aba Receita: marco = R$ X/mês -> clientes = arredondar para cima (X / ticket).
// Aba Clientes: marco = N clientes -> receita mensal = N x ticket.
// Valuation = receita mensal x 12 x múltiplo (estimativa editável).
// Meta de seguidores = clientes do marco x seguidores por cliente (para cima).

export type JornadaNumerosReais = {
  assinaturas: number;
  planosAnuncio30d: number;
  empresas: number;
  particulares: number;
  // Só as redes que o Hub lê de verdade; o resto fica null.
  seguidores?: Partial<Record<JornadaRede, number>>;
  // Leitura completa (valor, data, crescimento) de jornada-seguidores.ts.
  redes?: Partial<Record<JornadaRede, JornadaRedeAtual>>;
};

const REDE_VAZIA: JornadaRedeAtual = { valor: null, atualizadoEm: null, aoVivo: false, variacao30d: null, variacao30dPct: null, desde: null };

const cents = (v: number) => Math.round(v * 100) / 100;
// Tira o ruído de ponto flutuante antes de arredondar para cima
// (ex.: 10 x 149,9 / 149,9 não pode virar 11).
const teto = (v: number) => Math.ceil(Math.round(v * 1e6) / 1e6);

function seguidoresDe(clientes: number, p: JornadaPremissas): Record<JornadaRede, number> {
  const out = {} as Record<JornadaRede, number>;
  for (const rede of JORNADA_REDES_LISTA) out[rede] = teto(clientes * p.seguidoresPorCliente[rede]);
  return out;
}

// % da meta de seguidores de cada rede (travado em 100; meta 0 = 100%).
function progressoSeguidores(metas: Record<JornadaRede, number>, atuais: Record<JornadaRede, number | null>): Record<JornadaRede, number | null> {
  const out = {} as Record<JornadaRede, number | null>;
  for (const rede of JORNADA_REDES_LISTA) {
    const v = atuais[rede];
    out[rede] = v === null ? null : metas[rede] <= 0 ? 100 : Math.min(100, Math.floor((v / metas[rede]) * 100));
  }
  return out;
}

function marcar(marcos: Omit<JornadaMarco, "status">[], atual: number, falta: (alvo: number) => number, seguidores: Record<JornadaRede, number | null>): JornadaMarco[] {
  const proximo = marcos.findIndex((m) => atual < m.alvo);
  return marcos.map((m, i) => {
    if (proximo === -1 || i < proximo) return { ...m, status: "conquistado" };
    if (i > proximo) return { ...m, status: "futuro" };
    return {
      ...m,
      status: "proximo",
      falta: falta(m.alvo),
      progressoPct: Math.min(100, Math.floor((atual / m.alvo) * 100)),
      progressoSeguidores: progressoSeguidores(m.seguidores, seguidores),
    };
  });
}

export function montarJornada(reais: JornadaNumerosReais, p: JornadaPremissas, hoje: Date): Omit<HubJornada, "premissasPadrao"> {
  const receitaMensal = cents(reais.assinaturas + reais.planosAnuncio30d);
  const clientes = reais.empresas + reais.particulares;
  const base = (i: number, alvo: number, clientesDoMarco: number, receita: number) => ({
    nivel: i + 1,
    nome: JORNADA_NIVEIS[i]!,
    alvo,
    clientes: clientesDoMarco,
    receitaMensal: cents(receita),
    receitaAnual: cents(receita * 12),
    valuation: cents(receita * 12 * p.multiploValuation),
    seguidores: seguidoresDe(clientesDoMarco, p),
  });

  const redes = {} as Record<JornadaRede, JornadaRedeAtual>;
  const seguidores = {} as Record<JornadaRede, number | null>;
  for (const rede of JORNADA_REDES_LISTA) {
    const lida = reais.redes?.[rede];
    const valor = lida?.valor ?? reais.seguidores?.[rede] ?? null;
    redes[rede] = lida ? { ...lida, valor } : { ...REDE_VAZIA, valor };
    seguidores[rede] = valor;
  }

  const receita = marcar(
    JORNADA_MARCOS.map((alvo, i) => base(i, alvo, teto(alvo / p.ticketMedio), alvo)),
    receitaMensal,
    (alvo) => cents(alvo - receitaMensal),
    seguidores,
  );
  const porClientes = marcar(
    JORNADA_MARCOS.map((alvo, i) => base(i, alvo, alvo, alvo * p.ticketMedio)),
    clientes,
    (alvo) => alvo - clientes,
    seguidores,
  );

  return {
    geradoEm: hoje.toISOString(),
    atual: {
      receitaMensal,
      assinaturas: cents(reais.assinaturas),
      planosAnuncio30d: cents(reais.planosAnuncio30d),
      clientes,
      empresas: reais.empresas,
      particulares: reais.particulares,
      ticketMedio: clientes > 0 ? cents(receitaMensal / clientes) : null,
      valuation: cents(receitaMensal * 12 * p.multiploValuation),
      seguidores,
      redes,
    },
    premissas: p,
    receita,
    clientes: porClientes,
  };
}
