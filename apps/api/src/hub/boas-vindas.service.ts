import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import { safeSharp } from "../common/image-safety";
import { getPhotoStorage, readPhotoBytes } from "../common/storage";
import { PrismaService } from "../prisma/prisma.service";
import { ARTE, CORES, LOGO_EMPRESA, LOGO_MARCA, montarSvgBoasVindas } from "./boas-vindas-layout";
import { dataBoasVindas, origemIdBoasVindas, prefixoOrigemBoasVindas, problemasLegenda, textosBoasVindas, type TextosBoasVindas } from "./boas-vindas-regras";
import { criarConteudo } from "./marketing.service";

// Post automático de boas-vindas (pedido do Diego, 20/11/2026).
// Empresa com logo (Partner.logoUrl) E autorização de divulgação
// (Partner.socialConsentAt) ganha 2 conteúdos em Marketing → Aprovações, um
// para o Instagram e um para o Facebook, com a arte 1080×1350 e a legenda.
// Nada publica sem aprovação (o publicador do Hub só pega "aprovado").
// Uma empresa = um post (origemId fixo por empresa e rede). Retirar a
// autorização cancela o que ainda não foi ao ar.
//
// Chamado ao fim do cadastro, ao enviar a logo e ao salvar as redes/autorização.

export type ResultadoBoasVindas = "criado" | "ja_existe" | "sem_logo" | "sem_autorizacao" | "cancelado" | "sem_empresa";

const LOGO_NOSSA = join(__dirname, "..", "..", "assets", "logo.png");
const AINDA_NAO_PUBLICADO = ["rascunho", "em_aprovacao", "ajuste", "aprovado", "erro"];
const AUTOR = "Hub (boas-vindas automáticas)";

@Injectable()
export class BoasVindasService {
  private readonly logger = new Logger(BoasVindasService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Nunca derruba quem chamou (cadastro, logo, redes): só registra no log.
  async sincronizarSemFalhar(partnerId: string): Promise<void> {
    await this.sincronizar(partnerId).catch((e: Error) => this.logger.error(`Boas-vindas da empresa ${partnerId}: ${e.message}`));
  }

  async sincronizar(partnerId: string, agora = new Date()): Promise<ResultadoBoasVindas> {
    const p = await this.prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true, legalName: true, slug: true, type: true, logoUrl: true, instagram: true, facebook: true, socialConsentAt: true } });
    if (!p) return "sem_empresa";
    const prefixo = prefixoOrigemBoasVindas(p.id);

    if (!p.socialConsentAt) {
      const pendentes = await this.prisma.mktContent.findMany({ where: { origemId: { startsWith: prefixo }, status: { in: AINDA_NAO_PUBLICADO } }, select: { id: true, status: true } });
      let cancelados = 0;
      for (const c of pendentes) {
        const { count } = await this.prisma.mktContent.updateMany({ where: { id: c.id, status: c.status }, data: { status: "cancelado" } });
        if (!count) continue;
        cancelados++;
        await this.prisma.mktHistory.create({ data: { contentId: c.id, acao: "cancelado", autor: AUTOR, texto: "A empresa retirou a autorização de divulgação." } });
      }
      return cancelados ? "cancelado" : "sem_autorizacao";
    }
    if (!p.logoUrl) return "sem_logo";
    if ((await this.prisma.mktContent.count({ where: { origemId: { startsWith: prefixo } } })) > 0) return "ja_existe";

    const dados = { nome: p.legalName, slug: p.slug, type: p.type, instagram: p.instagram };
    const textos = textosBoasVindas(dados);
    // A regra vale para o texto fixo; o nome/endereço da empresa não conta
    // (uma loja chamada "Desconto Veículos" continua podendo ganhar o post).
    const problemas = problemasLegenda(textosBoasVindas({ ...dados, nome: "EMPRESA", slug: "empresa", instagram: p.instagram ? "perfil" : null }).legenda);
    if (problemas.length) throw new Error(`legenda fora das regras: ${problemas.join(", ")}`);

    const png = await this.gerarArte(textos, await readPhotoBytes(p.logoUrl));
    // O Instagram só publica JPEG: a arte vai para o armazenamento em JPEG de alta qualidade.
    const jpeg = await safeSharp(png).flatten({ background: CORES.creme }).jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
    const midia = await getPhotoStorage().save(jpeg, `boas-vindas-${p.slug}.jpg`, "image/jpeg");

    const dataPlanejada = dataBoasVindas(agora).toISOString();
    let criados = 0;
    for (const rede of ["instagram", "facebook"] as const) {
      const perfil = rede === "instagram" ? p.instagram : p.facebook;
      const r = await criarConteudo(
        this.prisma,
        {
          tipo: "post",
          redes: [rede],
          titulo: textos.tituloConteudo.slice(0, 160),
          legenda: textos.legenda,
          hashtags: [],
          midias: [midia],
          dataPlanejada,
          observacao: "Criado sozinho: a empresa enviou a logo e autorizou a divulgação. Depois de publicado, o Hub marca a empresa; se não conseguir, avisa para marcar pelo app.",
          detalhes: { gatilho: "boas-vindas automáticas", ...(perfil ? { [`marcar_${rede}`]: perfil } : {}) },
          origemId: origemIdBoasVindas(p.id, rede),
        },
        "hub",
        AUTOR,
      );
      if (!r.repetido) criados++;
    }
    return criados ? "criado" : "ja_existe";
  }

  // Arte 1080×1350 PNG: fundo creme liso, nosso logo no topo, logo da empresa
  // no centro (sem fundo nem efeito nosso), textos e rodapé (layout em
  // boas-vindas-layout.ts).
  async gerarArte(textos: TextosBoasVindas, logoEmpresa: Buffer): Promise<Buffer> {
    const marca = await safeSharp(await readFile(LOGO_NOSSA)).resize({ height: LOGO_MARCA.altura }).png().toBuffer();
    const marcaMeta = await safeSharp(marca).metadata();
    const empresa = await safeSharp(logoEmpresa).rotate().resize(LOGO_EMPRESA.larguraMax, LOGO_EMPRESA.alturaMax, { fit: "inside" }).png().toBuffer();
    const empresaMeta = await safeSharp(empresa).metadata();
    return safeSharp(undefined, { create: { width: ARTE.largura, height: ARTE.altura, channels: 3, background: CORES.creme } })
      .composite([
        { input: marca, top: LOGO_MARCA.topo, left: Math.round((ARTE.largura - (marcaMeta.width ?? 0)) / 2) },
        { input: empresa, top: Math.round(LOGO_EMPRESA.centroY - (empresaMeta.height ?? 0) / 2), left: Math.round((ARTE.largura - (empresaMeta.width ?? 0)) / 2) },
        { input: Buffer.from(await montarSvgBoasVindas(textos)), top: 0, left: 0 },
      ])
      .png()
      .toBuffer();
  }
}
