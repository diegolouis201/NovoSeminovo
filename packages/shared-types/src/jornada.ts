import { z } from "zod";

// Jornada do Hub: marcos de crescimento (pedido do Diego, 16/11/2026).
// Cada marco tem duas leituras, porque "uma coisa puxa a outra":
// - Receita mensal: R$ X por mês -> clientes = arredondar para cima (X / ticket médio).
// - Clientes: N clientes pagantes -> receita mensal = N x ticket médio.
// Ticket médio, múltiplo do valuation e seguidores por cliente são
// estimativas que o dono edita no Hub.

export const JORNADA_MARCOS = [10, 100, 1_000, 2_500, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 35_000, 40_000, 50_000, 55_000, 60_000, 70_000, 80_000, 90_000, 100_000] as const;

// Nome do nível de cada marco (mesma ordem de JORNADA_MARCOS).
export const JORNADA_NIVEIS = [
  "Largada",
  "Primeira centena",
  "Tração",
  "Decolagem",
  "Ritmo",
  "Escala",
  "Expansão",
  "Consolidação",
  "Referência",
  "Liderança regional",
  "Alta performance",
  "Potência",
  "Meio caminho",
  "Grande marca",
  "Elite",
  "Destaque nacional",
  "Gigante",
  "Lenda",
  "Topo",
] as const;

export const JORNADA_REDES = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn" } as const;
export type JornadaRede = keyof typeof JORNADA_REDES;
const REDES = Object.keys(JORNADA_REDES) as JornadaRede[];

const Razao = z.number().finite().min(0, "Use um número de 0 a 10.000").max(10_000, "Use um número de 0 a 10.000");
export const JornadaPremissasSchema = z.object({
  ticketMedio: z.number().finite().min(1, "Ticket médio entre R$ 1 e R$ 100.000").max(100_000, "Ticket médio entre R$ 1 e R$ 100.000"),
  multiploValuation: z.number().finite().min(0.5, "Múltiplo entre 0,5 e 50").max(50, "Múltiplo entre 0,5 e 50"),
  seguidoresPorCliente: z.object({ instagram: Razao, facebook: Razao, tiktok: Razao, youtube: Razao, linkedin: Razao }).strict(),
}).strict();
export type JornadaPremissas = z.infer<typeof JornadaPremissasSchema>;

export const JORNADA_PREMISSAS_PADRAO: JornadaPremissas = {
  ticketMedio: 200,
  multiploValuation: 5,
  seguidoresPorCliente: { instagram: 20, facebook: 10, tiktok: 10, youtube: 2, linkedin: 2 },
};
export const JORNADA_REDES_LISTA = REDES;

export type JornadaStatus = "conquistado" | "proximo" | "futuro";
export type JornadaMarco = {
  nivel: number;
  nome: string;
  alvo: number;
  clientes: number;
  receitaMensal: number;
  receitaAnual: number;
  valuation: number;
  seguidores: Record<JornadaRede, number>;
  status: JornadaStatus;
  // Só no próximo marco: quanto já foi (0 a 100) e quanto falta.
  progressoPct?: number;
  falta?: number;
};

export type HubJornada = {
  geradoEm: string;
  atual: {
    receitaMensal: number;
    assinaturas: number;
    planosAnuncio30d: number;
    clientes: number;
    empresas: number;
    particulares: number;
    ticketMedio: number | null;
    valuation: number;
    // null = a rede não está ligada ao Hub; nunca inventamos o número.
    seguidores: Record<JornadaRede, number | null>;
  };
  premissas: JornadaPremissas;
  premissasPadrao: boolean;
  receita: JornadaMarco[];
  clientes: JornadaMarco[];
};
