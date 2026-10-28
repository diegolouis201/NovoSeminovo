import Anthropic from "@anthropic-ai/sdk";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import sharp from "sharp";
import { formatBRL } from "@novoseminovo/shared-types";
import type { Prisma } from "@novoseminovo/db";
import { listingEvents } from "../common/listing-events";
import { PrismaService } from "../prisma/prisma.service";
import { readPhotoBytes } from "../common/storage";
import { AGENT_MODEL } from "../agents/agent-engine";
import { AdminService } from "./admin.service";
import { trackedAnthropic } from "../operations/ai-usage";
import { trackRoutine } from "../operations/routine-health";

// Moderação automática: a IA olha cada anúncio novo (texto + fotos) e
// aprova o que está normal, recusa o que é claramente irregular (com um
// motivo que o anunciante entende e corrige) e deixa pra uma pessoa só o
// que é duvidoso — com a nota do porquê no /admin. Liga sozinha quando há
// ANTHROPIC_API_KEY; AUTO_MODERATION_DISABLED=1 desliga (volta tudo pro admin).

const SWEEP_MS = 60 * 1000;
// Espera o cadastro terminar: as fotos sobem depois do anúncio ser criado.
const GRACE_MS = 3 * 60 * 1000;
const BATCH = 5;
const MAX_PHOTOS = 8;
const MAX_ATTEMPTS = 3;
const FAILED_NOTE = "A moderação automática não conseguiu analisar este anúncio — revise manualmente.";

const listingInclude = {
  photos: { orderBy: { position: "asc" } },
  vehicleDetails: true,
  propertyDetails: true,
  partner: { select: { legalName: true, type: true, verifiedAt: true } },
} satisfies Prisma.ListingInclude;
type ListingRow = Prisma.ListingGetPayload<{ include: typeof listingInclude }>;

type Decision = { decision: "approve" | "reject" | "human"; ownerReason?: string; adminNote?: string };

const SYSTEM = `Você é o moderador de anúncios do NovoSeminovo, marketplace brasileiro de carros, motos e imóveis (atuação nacional). Analise o anúncio (dados + fotos) e decida com a ferramenta registrar_decisao.

APROVAR quando o anúncio é um veículo ou imóvel real e coerente: fotos mostram o bem anunciado (ou ambientes/fachada compatíveis), texto sem ofensas, preço plausível. Pequenas imperfeições (foto escura, texto curto, erro de digitação, logo da loja ou imobiliária na foto, placa borrada) NÃO impedem a aprovação. Na dúvida leve entre aprovar e revisão humana, prefira aprovar se não houver nenhum sinal de risco.

RECUSAR só quando for claro, e escreva um motivo curto, educado e que o anunciante consiga corrigir:
- fotos sem relação com o bem (memes, pessoas, documentos, outro tipo de bem, imagens aleatórias);
- conteúdo ofensivo, sexual, violento ou discriminatório;
- telefone, WhatsApp, e-mail, links ou redes sociais no texto ou escritos nas fotos (o contato é pelo site);
- não é veículo nem imóvel, ou é item proibido;
- preço simbólico ou falso (ex.: R$ 1, 123456789) ou texto sem sentido/spam.

REVISÃO HUMANA quando houver dúvida real ou risco: sinais de golpe (preço muito abaixo do mercado, pedido de sinal/depósito antecipado, urgência exagerada), fotos com marca d'água de outro portal de anúncios, informações que se contradizem (ex.: fotos de casa num anúncio de apartamento), anúncio sem fotos. Escreva para o administrador, em uma frase, o que conferir.

Nunca invente fatos; julgue só pelo que está no anúncio.`;

const DECISION_TOOL: Anthropic.Tool = {
  name: "registrar_decisao",
  description: "Registra a decisão de moderação do anúncio.",
  input_schema: {
    type: "object",
    properties: {
      decisao: { type: "string", enum: ["aprovar", "recusar", "revisao_humana"] },
      motivo_para_anunciante: { type: "string", description: "Se recusar: o que está errado e como corrigir (1–2 frases)." },
      nota_para_admin: { type: "string", description: "Se revisão humana: o que a pessoa deve conferir (1 frase)." },
    },
    required: ["decisao"],
  },
};

function describe(listing: ListingRow): string {
  const details = listing.vehicleDetails ?? listing.propertyDetails;
  const clean = details
    ? Object.fromEntries(
        Object.entries(details).filter(([key, value]) => value !== null && value !== "" && !["id", "listingId", "createdAt", "updatedAt"].includes(key)),
      )
    : {};
  return [
    `Tipo: ${listing.type === "vehicle" ? "veículo" : "imóvel"}`,
    `Título: ${listing.title}`,
    `Preço: ${formatBRL(Number(listing.price))}`,
    `Local: ${listing.neighborhood ? `${listing.neighborhood}, ` : ""}${listing.city}/${listing.state}`,
    `Anunciante: ${listing.partner ? `${listing.partner.legalName} (${listing.partner.type}${listing.partner.verifiedAt ? ", empresa verificada" : ", empresa ainda não verificada"})` : "pessoa física"}`,
    `Detalhes: ${JSON.stringify(clean, (_key, value) => (typeof value === "bigint" ? Number(value) : value))}`,
    `Descrição:\n${listing.description}`,
    `Fotos: ${listing.photos.length}${listing.photos.length > MAX_PHOTOS ? ` (mostrando as ${MAX_PHOTOS} primeiras)` : ""}`,
  ].join("\n");
}

@Injectable()
export class AutoModerationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoModerationService.name);
  private client?: Anthropic;
  private timer?: NodeJS.Timeout;
  private running = false;
  // Anúncios sendo analisados agora (a varredura e o aviso de pagamento não
  // analisam o mesmo duas vezes).
  private readonly inReview = new Set<string>();
  private readonly onPaid = (listingId: string) => void this.reviewNow(listingId);
  private readonly failures = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
  ) {}

  isEnabled(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.AUTO_MODERATION_DISABLED !== "1";
  }

  onModuleInit(): void {
    if (!this.isEnabled()) return;
    // Anúncio que ficou pra revisão só porque a IA falhou (erro da API, já
    // corrigido) volta pra fila e é analisado de novo.
    void this.prisma.listing
      .updateMany({ where: { status: "pending_review", autoReviewNote: FAILED_NOTE }, data: { autoReviewedAt: null, autoReviewNote: null } })
      .catch((error: Error) => this.logger.warn(`Não reabri a fila da moderação: ${error.message}`));
    this.timer = setInterval(() => void trackRoutine("moderacao", SWEEP_MS, () => this.sweep()), SWEEP_MS);
    this.timer.unref();
    listingEvents.on("pagamento-confirmado", this.onPaid);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    listingEvents.off("pagamento-confirmado", this.onPaid);
  }

  // Pagamento confirmado: analisa já, sem esperar a carência das fotos (no
  // passo a passo o pagamento vem depois do envio delas).
  async reviewNow(listingId: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const listing = await this.prisma.listing.findFirst({
        where: { id: listingId, status: "pending_review", autoReviewedAt: null },
        include: listingInclude,
      });
      if (listing) await this.review(listing);
    } catch (error) {
      this.logger.error(`Falha na moderação do anúncio pago ${listingId}: ${(error as Error).message}`);
    }
  }

  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const listings = await this.prisma.listing.findMany({
        where: {
          status: "pending_review",
          autoReviewedAt: null,
          // Pago entra sem carência (caso o aviso na hora do pagamento falhe).
          OR: [{ createdAt: { lte: new Date(Date.now() - GRACE_MS) } }, { boostPurchases: { some: { status: "paid" } } }],
        },
        include: listingInclude,
        orderBy: { createdAt: "asc" },
        take: BATCH,
      });
      for (const listing of listings) await this.review(listing);
    } catch (error) {
      this.logger.error(`Falha na moderação automática: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async review(listing: ListingRow): Promise<void> {
    if (this.inReview.has(listing.id)) return;
    this.inReview.add(listing.id);
    try {
      await this.reviewOnce(listing);
    } finally {
      this.inReview.delete(listing.id);
    }
  }

  private async reviewOnce(listing: ListingRow): Promise<void> {
    let decision: Decision;
    if (listing.photos.length === 0) {
      decision = { decision: "human", adminNote: "Anúncio sem fotos — confira se o anunciante ainda vai enviar." };
    } else {
      try {
        decision = await this.decide(listing);
        this.failures.delete(listing.id);
      } catch (error) {
        const attempts = (this.failures.get(listing.id) ?? 0) + 1;
        this.failures.set(listing.id, attempts);
        this.logger.warn(`IA não analisou o anúncio ${listing.id} (tentativa ${attempts}): ${(error as Error).message}`);
        if (attempts < MAX_ATTEMPTS) return;
        this.failures.delete(listing.id);
        decision = { decision: "human", adminNote: FAILED_NOTE };
      }
    }

    if (decision.decision === "human") {
      await this.prisma.listing.update({
        where: { id: listing.id },
        data: { autoReviewedAt: new Date(), autoReviewNote: (decision.adminNote || "A IA ficou em dúvida — revise.").slice(0, 500) },
      });
      this.logger.log(`Anúncio ${listing.id} deixado para revisão humana`);
      return;
    }
    await this.admin
      .applyModeration(listing.id, decision.decision, decision.decision === "reject" ? decision.ownerReason?.slice(0, 500) : undefined)
      .catch((error: Error) => this.logger.warn(`Não apliquei a decisão no anúncio ${listing.id}: ${error.message}`));
    this.logger.log(`Anúncio ${listing.id} ${decision.decision === "approve" ? "aprovado" : "recusado"} pela IA`);
  }

  private async decide(listing: ListingRow): Promise<Decision> {
    this.client ??= trackedAnthropic("moderacao", process.env.ANTHROPIC_API_KEY);
    const images: Anthropic.ImageBlockParam[] = [];
    // Foto que não abre (link do CRM fora do ar, arquivo corrompido) é
    // pulada; nenhuma abrindo = uma pessoa confere.
    for (const photo of listing.photos.slice(0, MAX_PHOTOS)) {
      try {
        const jpeg = await sharp(await readPhotoBytes(photo.url)).rotate().resize(768, 768, { fit: "inside" }).jpeg({ quality: 75 }).toBuffer();
        images.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } });
      } catch (error) {
        this.logger.warn(`Foto ${photo.id} do anúncio ${listing.id} não abriu: ${(error as Error).message}`);
      }
    }
    if (images.length === 0) return { decision: "human", adminNote: "Nenhuma foto do anúncio abriu para a análise automática — confira as fotos." };
    const response = await this.client.messages.create({
      model: AGENT_MODEL,
      // O modelo atual não aceita tool_choice forçado ("tool"/"any") — vai
      // "auto" e o prompt manda sempre terminar na ferramenta. Espaço folgado
      // pro raciocínio antes da chamada.
      max_tokens: 4000,
      system: `${SYSTEM}\n\nResponda SEMPRE chamando a ferramenta registrar_decisao, uma única vez — sem texto fora dela.`,
      tools: [DECISION_TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: [{ type: "text", text: describe(listing) }, ...images] }],
    });
    const call = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (!call) throw new Error(`a IA respondeu sem chamar registrar_decisao (stop_reason ${response.stop_reason})`);
    const input = (call?.input ?? {}) as { decisao?: string; motivo_para_anunciante?: string; nota_para_admin?: string };
    if (input.decisao === "aprovar") return { decision: "approve" };
    // Recusa sem motivo não ajuda o anunciante — vira revisão humana.
    if (input.decisao === "recusar" && input.motivo_para_anunciante?.trim()) return { decision: "reject", ownerReason: input.motivo_para_anunciante.trim() };
    return { decision: "human", adminNote: input.nota_para_admin?.trim() || input.motivo_para_anunciante?.trim() };
  }
}
