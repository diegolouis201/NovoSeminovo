import { createHmac } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@novoseminovo/db";
import {
  PROSPECCAO_SEGMENTOS,
  ProspeccaoConfirmarSchema,
  type ProspeccaoAnalise,
  type ProspeccaoConfirmar,
  type ProspeccaoLinhaRecusada,
  type ProspeccaoPreviaLinha,
  type ProspeccaoResultado,
} from "@novoseminovo/shared-types";
import { currentDataKeys } from "../common/field-encryption";
import { parseOrBadRequest } from "../common/parse";
import { PrismaService } from "../prisma/prisma.service";
import {
  CAMPOS_IMPORT,
  IMPORT_PREVIA_LINHAS,
  MOTIVO_CHAVE,
  analisarCsv,
  chavesDedup,
  csvRelatorio,
  normCidade,
  normNome,
  tipoDaChave,
  type AnaliseCsv,
  type CampoImport,
  type LinhaProspect,
} from "./importacao";

// Importação de empresas do Mailerfind (Google Maps) para o CRM do Hub.
// Dois passos: analisar (prévia, nada gravado) e confirmar (mesmo arquivo).
// A mesma empresa nunca entra duas vezes: confere o CRM (telefone, e-mail,
// site, nome+cidade), as empresas já cadastradas no site, o próprio arquivo
// e, na gravação, a trava do banco (prospect_dedup_keys, chave primária).

export const ORIGEM_MAILERFIND = "mailerfind";
const LOTE = 1000;
const nacional = (tel: string | null | undefined) => {
  const d = (tel ?? "").replace(/\D/g, "");
  return d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
};
const lotes = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / LOTE) }, (_, i) => xs.slice(i * LOTE, (i + 1) * LOTE));

type Classificacao = Map<number, string>; // linha → motivo da duplicada

@Injectable()
export class ProspeccaoImportService {
  constructor(private readonly prisma: PrismaService) {}

  // HMAC da chave (telefone, e-mail, site, nome+cidade): a trava do banco
  // nunca guarda o dado em si.
  private chaveSegura(chave: string): string {
    return createHmac("sha256", currentDataKeys().mac).update(`prospeccao|${chave}`).digest("hex");
  }

  private lerArquivo(bytes: Buffer): AnaliseCsv {
    const a = analisarCsv(bytes);
    if ("erro" in a) throw new BadRequestException(a.erro);
    return a;
  }

  // Conjuntos de chaves já existentes: CRM (cards) e empresas parceiras.
  private async jaExistentes(linhas: LinhaProspect[]): Promise<{ crm: Set<string>; parceiras: Set<string> }> {
    const crm = new Set<string>();
    const parceiras = new Set<string>();
    const telefones = [...new Set(linhas.map((l) => l.telefone).filter((t): t is string => Boolean(t)))];
    const emails = [...new Set(linhas.map((l) => l.email).filter((e): e is string => Boolean(e)))];
    const dominios = [...new Set(linhas.map((l) => l.dominio).filter((d): d is string => Boolean(d)))];
    const lugares = [...new Set(linhas.map((l) => l.placeId).filter((d): d is string => Boolean(d)))];
    const marcar = (alvo: (parceira: boolean) => Set<string>, parceira: boolean, chaves: string[]) => chaves.forEach((c) => alvo(parceira).add(c));
    const destino = (parceira: boolean) => (parceira ? parceiras : crm);

    for (const lote of lotes(telefones)) {
      const cards = await this.prisma.salesProspect.findMany({ where: { phone: { in: lote } }, select: { phone: true, partnerId: true } });
      for (const c of cards) marcar(destino, Boolean(c.partnerId), [`telefone:${nacional(c.phone)}`]);
      const donos = await this.prisma.partner.findMany({ where: { owner: { phone: { in: lote } } }, select: { owner: { select: { phone: true } } } });
      for (const p of donos) parceiras.add(`telefone:${nacional(p.owner.phone)}`);
    }
    for (const lote of lotes(emails)) {
      const cards = await this.prisma.salesProspect.findMany({ where: { email: { in: lote } }, select: { email: true, partnerId: true } });
      for (const c of cards) marcar(destino, Boolean(c.partnerId), [`email:${(c.email ?? "").toLowerCase()}`]);
      const donos = await this.prisma.partner.findMany({ where: { owner: { email: { in: lote, mode: "insensitive" } } }, select: { owner: { select: { email: true } } } });
      for (const p of donos) parceiras.add(`email:${p.owner.email.toLowerCase()}`);
    }
    for (const lote of lotes(dominios)) {
      const cards = await this.prisma.salesProspect.findMany({ where: { siteDomain: { in: lote } }, select: { siteDomain: true, partnerId: true } });
      for (const c of cards) marcar(destino, Boolean(c.partnerId), [`site:${c.siteDomain}`]);
    }
    for (const lote of lotes(lugares)) {
      const cards = await this.prisma.salesProspect.findMany({ where: { googlePlaceId: { in: lote } }, select: { googlePlaceId: true, partnerId: true } });
      for (const c of cards) marcar(destino, Boolean(c.partnerId), [`lugar:${c.googlePlaceId}`]);
    }
    // Nome + cidade: compara sem acento e sem "LTDA" (não dá para fazer no SQL).
    const cards = await this.prisma.salesProspect.findMany({ where: { city: { not: null } }, select: { name: true, city: true, partnerId: true } });
    for (const c of cards) {
      const nome = normNome(c.name);
      if (nome && c.city) destino(Boolean(c.partnerId)).add(`nome:${nome}|${normCidade(c.city)}`);
    }
    const empresas = await this.prisma.partner.findMany({ where: { city: { not: null } }, select: { legalName: true, city: true } });
    for (const p of empresas) {
      const nome = normNome(p.legalName);
      if (nome && p.city) parceiras.add(`nome:${nome}|${normCidade(p.city)}`);
    }
    // Já importadas (trava do banco), inclusive as que mudaram de cidade/nome depois.
    const todas = linhas.flatMap((l) => chavesDedup(l).map((c) => [this.chaveSegura(c), c] as const));
    const porHmac = new Map(todas);
    for (const lote of lotes([...porHmac.keys()])) {
      const travas = await this.prisma.prospectDedupKey.findMany({ where: { key: { in: lote } }, select: { key: true, prospect: { select: { partnerId: true } } } });
      for (const t of travas) destino(Boolean(t.prospect.partnerId)).add(porHmac.get(t.key)!);
    }
    return { crm, parceiras };
  }

  private async classificar(linhas: LinhaProspect[]): Promise<Classificacao> {
    const { crm, parceiras } = await this.jaExistentes(linhas);
    const motivos: Classificacao = new Map();
    for (const l of linhas) {
      const chaves = chavesDedup(l);
      const parceira = chaves.find((c) => parceiras.has(c));
      const noCrm = chaves.find((c) => crm.has(c));
      if (parceira) motivos.set(l.linha, `Já é parceira do site (cadastrada): ${MOTIVO_CHAVE[tipoDaChave(parceira)]}`);
      else if (noCrm) motivos.set(l.linha, `Já está no CRM: ${MOTIVO_CHAVE[tipoDaChave(noCrm)]}`);
    }
    return motivos;
  }

  async analisar(bytes: Buffer, _nomeArquivo?: string): Promise<ProspeccaoAnalise> {
    const a = this.lerArquivo(bytes);
    const motivos = await this.classificar(a.validas);
    const jaNoCrm = [...motivos.values()].filter((m) => m.startsWith("Já está")).length;
    const usadas = new Set(Object.values(a.mapa));
    const anterior = await this.prisma.prospectImport.findFirst({ where: { fileHash: a.hash }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });

    const porLinha = new Map<number, ProspeccaoPreviaLinha>();
    for (const l of a.validas) {
      const motivo = motivos.get(l.linha);
      porLinha.set(l.linha, { linha: l.linha, nome: l.nome, telefone: l.telefone, email: l.email, site: l.site, cidade: l.cidade, uf: l.uf, categoria: l.categoria, nota: l.nota, avaliacoes: l.avaliacoes, situacao: motivo ? "duplicada" : "nova", motivo });
    }
    for (const d of a.duplicadas) porLinha.set(d.linha, { linha: d.linha, nome: d.nome, situacao: "duplicada", motivo: d.motivo });
    for (const i of a.invalidas) porLinha.set(i.linha, { linha: i.linha, nome: i.nome, situacao: "invalida", motivo: i.motivo });
    const previa = [...porLinha.values()].sort((x, y) => x.linha - y.linha).slice(0, IMPORT_PREVIA_LINHAS);
    for (const p of previa) for (const k of Object.keys(p) as (keyof ProspeccaoPreviaLinha)[]) if (p[k] === undefined) delete p[k];

    return {
      hash: a.hash,
      total: a.total,
      colunas: (Object.keys(CAMPOS_IMPORT) as CampoImport[]).map((campo) => ({ campo, rotulo: CAMPOS_IMPORT[campo], coluna: a.mapa[campo] === undefined ? undefined : a.cabecalho[a.mapa[campo]!] })),
      colunasIgnoradas: a.cabecalho.filter((h, i) => h && !usadas.has(i)).slice(0, 50),
      previa,
      contagens: {
        novas: a.validas.length - motivos.size,
        jaNoCrm,
        jaParceiras: motivos.size - jaNoCrm,
        repetidasNoArquivo: a.duplicadas.length,
        invalidas: a.invalidas.length,
        emailsDescartados: a.emailsDescartados,
      },
      jaImportadoEm: anterior?.createdAt.toISOString(),
    };
  }

  async confirmar(bytes: Buffer, raw: ProspeccaoConfirmar, userId: string): Promise<ProspeccaoResultado> {
    const opcoes = parseOrBadRequest(ProspeccaoConfirmarSchema, raw);
    const a = this.lerArquivo(bytes);
    if (a.hash !== opcoes.hash) throw new BadRequestException("O arquivo mudou depois da análise. Analise de novo antes de importar.");
    const motivos = await this.classificar(a.validas);
    const duplicadas: ProspeccaoLinhaRecusada[] = [...a.duplicadas];
    let criadas = 0;
    const segmento = PROSPECCAO_SEGMENTOS[opcoes.segmento];
    for (const l of a.validas) {
      const motivo = motivos.get(l.linha);
      if (motivo) {
        duplicadas.push({ linha: l.linha, nome: l.nome, motivo });
        continue;
      }
      if (await this.criar(l, opcoes, segmento.businessType)) criadas++;
      else duplicadas.push({ linha: l.linha, nome: l.nome, motivo: "Já está no CRM: entrou por outra importação ao mesmo tempo" });
    }
    duplicadas.sort((x, y) => x.linha - y.linha);
    await this.prisma.prospectImport.create({
      data: { fileHash: a.hash, fileName: opcoes.nomeArquivo, tag: opcoes.etiqueta, segment: opcoes.segmento, total: a.total, created: criadas, duplicates: duplicadas.length, invalid: a.invalidas.length, createdById: userId },
    });
    const recusadas = [...a.invalidas, ...duplicadas].sort((x, y) => x.linha - y.linha);
    return { criadas, duplicadas, invalidas: a.invalidas, relatorioCsv: csvRelatorio(recusadas) };
  }

  // Card + travas numa gravação só: se outra importação já gravou a mesma
  // chave, o banco recusa (P2002) e nada desta empresa fica.
  private async criar(l: LinhaProspect, opcoes: ProspeccaoConfirmar, businessType: string): Promise<boolean> {
    const extra: Record<string, string | number> = {};
    for (const k of ["endereco", "categoria", "nota", "avaliacoes", "mapsUrl", "instagram", "facebook"] as const) if (l[k] !== undefined) extra[k] = l[k]!;
    const google = [l.categoria, l.nota !== undefined ? `nota ${String(l.nota).replace(".", ",")} no Google (${l.avaliacoes ?? 0} avaliações)` : ""].filter(Boolean).join(", ");
    try {
      await this.prisma.salesProspect.create({
        data: {
          name: l.nome,
          segment: opcoes.segmento,
          businessType,
          city: l.cidade,
          state: l.uf,
          phone: l.telefone,
          email: l.email,
          website: l.site,
          siteDomain: l.dominio,
          googlePlaceId: l.placeId,
          campaignTag: opcoes.etiqueta,
          importData: Object.keys(extra).length ? (extra as Prisma.InputJsonValue) : undefined,
          stage: "a_abordar",
          source: ORIGEM_MAILERFIND,
          dedupKeys: { create: chavesDedup(l).map((c) => ({ key: this.chaveSegura(c) })) },
          notes: { create: { kind: "note", body: `Importada do Mailerfind (busca do Google Maps, dado público), campanha "${opcoes.etiqueta}".${google ? ` ${google}.` : ""}`.slice(0, 2000) } },
        },
        select: { id: true },
      });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return false;
      throw error;
    }
  }

  // Etiquetas usadas nas importações (filtro da lista de Empresas e inscrição nas sequências).
  async etiquetas(): Promise<{ etiqueta: string; total: number }[]> {
    const rows = await this.prisma.salesProspect.groupBy({ by: ["campaignTag"], where: { campaignTag: { not: null } }, _count: { _all: true }, orderBy: { campaignTag: "asc" } });
    return rows.map((r) => ({ etiqueta: r.campaignTag!, total: r._count._all }));
  }
}
