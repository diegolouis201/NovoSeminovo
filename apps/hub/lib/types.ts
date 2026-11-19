// Formato do feed do CRM (cópia de apps/api/src/crm/crm.service.ts — mude lá e aqui).
import type { SalesStageId } from "@novoseminovo/shared-types";

export type CrmEmpresa = {
  id: string;
  nome: string;
  tipo: string;
  segmento?: "vehicle" | "property";
  cnpj: string;
  cidade?: string;
  uf?: string;
  pagina: string;
  cadastroNoSiteEm: string;
  abertaEm?: string;
  periodoGratisAte: string;
  verificada: boolean;
  setor?: string;
  porte?: string;
  capitalSocial?: number;
  pais: "Brasil";
  perfil: { funcionarios?: string; faturamento?: string };
  responsavel: { nome: string; cargo?: string; email: string; telefone?: string };
  logo?: string;
  redesSociais: { instagram?: string; facebook?: string };
  autorizaDivulgacaoEm?: string;
  origemMarketing?: OrigemMarketing;
  uso: { ultimoAcesso?: string; diasSemAcesso?: number; visualizacoes: number };
  chamados: { total: number; abertos: number; abertoDesde?: string; tempoMedioResolucaoHoras?: number; ultimoAssunto?: string };
  nps?: { nota: number; data: string; comentario?: string; classificacao: "promotor" | "neutro" | "detrator"; origem?: "painel" | "email"; querContato?: boolean };
  motivoPerda?: { categoria?: string; texto?: string };
  socios: { nome: string; cargo?: string; aniversario?: string }[];
  etapa: { id: SalesStageId; nome: string };
  vendedor?: string;
  origem?: string;
  proximoContato?: string;
  proximoContatoTipo?: string;
  plano?: { nome: string; valorMensal: number; status: "ativa" | "em_atraso" | "cancelada"; mudouEm: string; periodoAte: string };
  pagamentos: { quantidade: number; totalPago: number; ticketMedio?: number; primeiro?: string; ultimo?: string };
  anuncios: { noAr: number; total: number };
  leads: { total: number; ultimos30Dias: number; vendidos: number; paradosMais3Dias: number };
  ultimasAnotacoes: { data: string; tipo: string; texto: string; autor?: string }[];
  // Última ligação, WhatsApp, e-mail ou reunião registrada (régua de relacionamento).
  ultimoContato?: { data: string; tipo: string };
  cardId?: string;
};
export type CrmProspeccao = {
  cardId: string;
  nome: string;
  segmento: string;
  cidade?: string;
  uf?: string;
  contato?: string;
  cargo?: string;
  telefone?: string;
  email?: string;
  perfil: { funcionarios?: string; faturamento?: string };
  etapa: { id: SalesStageId; nome: string };
  vendedor?: string;
  proximoContato?: string;
  proximoContatoTipo?: string;
  motivoPerda?: { categoria?: string; texto?: string };
  ultimoContato?: { data: string; tipo: string };
  // manual | prospeccao | campanha (SALES_SOURCE_LABELS).
  origem: string;
  origemMarketing?: OrigemMarketing;
  // Importadas do Mailerfind (Google Maps).
  etiqueta?: string;
  site?: string;
  // Sequência de e-mails: respondeu (marcado pelo Comercial) / pediu para sair.
  respondeuEm?: string;
  saiuEm?: string;
  google?: { endereco?: string; categoria?: string; nota?: number; avaliacoes?: number; mapsUrl?: string; instagram?: string; facebook?: string };
  criadoEm: string;
};
export type OrigemMarketing = { canal: string; meio?: string; campanha?: string; anuncio?: string; publico?: string };
export type CrmFeed = { geradoEm: string; empresas: CrmEmpresa[]; prospeccao: CrmProspeccao[] };
