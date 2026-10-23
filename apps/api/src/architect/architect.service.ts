import Anthropic from "@anthropic-ai/sdk";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import sharp from "sharp";
import {
  ArchitectShoppingItemSchema,
  formatBRL,
  type ArchitectSessionView,
  type ArchitectShoppingList,
  type ArchitectStoreId,
} from "@novoseminovo/shared-types";
import type { Prisma } from "@novoseminovo/db";
import { PrismaService } from "../prisma/prisma.service";
import { getPhotoStorage, readPhotoBytes } from "../common/storage";
import { runAgentTurn, visibleMessages, type AgentDefinition, type AgentTool } from "../agents/agent-engine";
import { GeminiImageService } from "./gemini-image.service";
import { storeSearchUrl } from "./affiliate";

// Arquiteto NovoSeminovo: o comprador logado conversa com a IA sobre como
// reformar o imóvel do anúncio; a IA olha as fotos (Claude), gera a imagem
// do cômodo reformado (Gemini) e monta a lista de compras com faixa de preço
// e links de lojas (afiliados — ver affiliate.ts).

const DAILY_IMAGES = Number(process.env.ARCHITECT_DAILY_IMAGES ?? 5);
const DAILY_MESSAGES = 60;
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

const sessionInclude = {
  listing: { include: { photos: { orderBy: { position: "asc" } }, propertyDetails: true } },
  images: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.ArchitectSessionInclude;
type SessionRow = Prisma.ArchitectSessionGetPayload<{ include: typeof sessionInclude }>;

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  house: "casa",
  apartment: "apartamento",
  penthouse: "cobertura",
  condo_house: "casa em condomínio",
  studio: "kitnet/studio",
  commercial: "sala comercial",
  store: "loja",
  garage: "garagem",
  land: "terreno",
  farm: "imóvel rural",
  warehouse: "galpão",
};

// Começo do dia no horário de Brasília (o limite "por dia" é o dia do cliente).
function startOfTodayBrt(): Date {
  const now = Date.now() - BRT_OFFSET_MS;
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  return new Date(day.getTime() + BRT_OFFSET_MS);
}

// Fotos em base64 não vão pro banco: o histórico guarda só uma marcação.
function withoutImages(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return messages.map((message) => {
    if (typeof message.content === "string") return message;
    return {
      ...message,
      content: message.content.map((block) => {
        if (block.type !== "tool_result" || !Array.isArray(block.content)) return block;
        return {
          ...block,
          content: block.content.map((inner) =>
            inner.type === "image" ? { type: "text" as const, text: "[foto mostrada aqui — descreva de memória se precisar]" } : inner,
          ),
        };
      }),
    } as Anthropic.MessageParam;
  });
}

@Injectable()
export class ArchitectService {
  private readonly logger = new Logger(ArchitectService.name);
  private client?: Anthropic;
  private readonly messageCount = new Map<string, { day: string; count: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiImageService,
  ) {}

  private getClient(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException("O Arquiteto NovoSeminovo está fora do ar no momento.");
    this.client ??= new Anthropic({ apiKey });
    return this.client;
  }

  private async imagesUsedToday(userId: string): Promise<number> {
    return this.prisma.architectImage.count({ where: { userId, createdAt: { gte: startOfTodayBrt() } } });
  }

  async openSession(userId: string, listingId: string): Promise<ArchitectSessionView> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { id: true, type: true, status: true, ownerUserId: true } });
    if (!listing) throw new NotFoundException("Anúncio não encontrado.");
    if (listing.type !== "property") throw new BadRequestException("O Arquiteto NovoSeminovo é para anúncios de imóveis.");
    if (listing.status !== "active" && listing.ownerUserId !== userId) throw new BadRequestException("Este anúncio não está mais disponível.");
    const existing = await this.prisma.architectSession.findFirst({
      where: { userId, listingId },
      orderBy: { updatedAt: "desc" },
      include: sessionInclude,
    });
    const session = existing ?? (await this.prisma.architectSession.create({ data: { userId, listingId }, include: sessionInclude }));
    return this.toView(session, userId);
  }

  async getSession(userId: string, sessionId: string): Promise<ArchitectSessionView> {
    return this.toView(await this.loadOwned(userId, sessionId), userId);
  }

  private async loadOwned(userId: string, sessionId: string): Promise<SessionRow> {
    const session = await this.prisma.architectSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
    if (!session) throw new NotFoundException("Conversa não encontrada.");
    if (session.userId !== userId) throw new ForbiddenException("Esta conversa é de outra pessoa.");
    return session;
  }

  private checkMessageLimit(userId: string) {
    const day = startOfTodayBrt().toISOString();
    const current = this.messageCount.get(userId);
    const count = current?.day === day ? current.count : 0;
    if (count >= DAILY_MESSAGES) throw new BadRequestException("Você chegou ao limite de mensagens do Arquiteto por hoje. Volte amanhã!");
    this.messageCount.set(userId, { day, count: count + 1 });
  }

  async sendMessage(userId: string, sessionId: string, text: string, photoId?: string): Promise<ArchitectSessionView> {
    const session = await this.loadOwned(userId, sessionId);
    this.checkMessageLimit(userId);
    const photos = session.listing.photos;
    const selected = photoId ? photos.find((photo) => photo.id === photoId) : undefined;
    const userText = selected ? `[Foto selecionada na tela: ${selected.id}${selected.caption ? ` — ${selected.caption}` : ""}]\n${text}` : text;

    const agent = await this.buildAgent(session, userId);
    const history = (session.messages as unknown as Anthropic.MessageParam[]) ?? [];
    let result: Awaited<ReturnType<typeof runAgentTurn>>;
    try {
      result = await runAgentTurn(this.getClient(), agent, history, userText);
    } catch (error) {
      this.logger.error(`Arquiteto falhou: ${(error as Error).message}`);
      throw new ServiceUnavailableException("O Arquiteto não conseguiu responder agora. Tente de novo em instantes.");
    }
    await this.prisma.architectSession.update({
      where: { id: session.id },
      data: { messages: withoutImages(result.messages) as unknown as Prisma.InputJsonValue },
    });
    return this.getSession(userId, session.id);
  }

  private async buildAgent(session: SessionRow, userId: string): Promise<AgentDefinition> {
    const listing = session.listing;
    const details = listing.propertyDetails;
    const photos = listing.photos;
    const imagesLeft = Math.max(0, DAILY_IMAGES - (await this.imagesUsedToday(userId)));
    const property = details
      ? [
          `${PROPERTY_TYPE_LABEL[details.propertyType] ?? "imóvel"} ${details.purpose === "rent" ? "para alugar" : "à venda"}`,
          `${Number(details.areaM2)} m²`,
          details.bedrooms != null ? `${details.bedrooms} quartos` : "",
          details.suites ? `${details.suites} suítes` : "",
          details.bathrooms != null ? `${details.bathrooms} banheiros` : "",
          details.parkingSpots ? `${details.parkingSpots} vagas` : "",
          details.floor != null ? `${details.floor}º andar` : "",
        ]
          .filter(Boolean)
          .join(", ")
      : "imóvel";

    const tools: AgentTool[] = [
      {
        definition: {
          name: "ver_foto",
          description: "Mostra uma foto do anúncio para você analisar o cômodo (piso, paredes, luz, janelas, móveis, estado de conservação). Use antes de propor mudanças num cômodo.",
          input_schema: { type: "object", properties: { foto_id: { type: "string", description: "Id da foto (lista no início)." } }, required: ["foto_id"] },
        },
        run: async (input) => {
          const photo = photos.find((item) => item.id === String(input.foto_id));
          if (!photo) throw new Error("Foto não encontrada neste anúncio.");
          const jpeg = await sharp(await readPhotoBytes(photo.url)).rotate().resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
          return {
            contentBlocks: [
              { type: "text", text: `Foto ${photo.id}${photo.caption ? ` (${photo.caption})` : ""}:` },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
            ],
          };
        },
      },
      {
        definition: {
          name: "gerar_imagem_reforma",
          description:
            "Gera uma imagem fotorrealista do cômodo da foto depois da reforma proposta. Gasta 1 das imagens diárias do cliente — confirme a ideia antes quando houver dúvida. Escreva as instruções EM INGLÊS, detalhadas: piso, paredes, cores, marcenaria, móveis, iluminação, decoração e estilo.",
          input_schema: {
            type: "object",
            properties: {
              foto_id: { type: "string", description: "Id da foto do cômodo a reformar." },
              instrucoes_em_ingles: { type: "string", description: "O que mudar, em inglês, específico e visual." },
              resumo_em_portugues: { type: "string", description: "Uma frase curta em português do que a imagem mostra (aparece na tela)." },
            },
            required: ["foto_id", "instrucoes_em_ingles", "resumo_em_portugues"],
          },
        },
        run: async (input) => this.generateImage(session, userId, String(input.foto_id), String(input.instrucoes_em_ingles), String(input.resumo_em_portugues)),
      },
      {
        definition: {
          name: "salvar_lista_de_compras",
          description:
            "Salva (substitui) a lista de compras da reforma combinada, que o cliente vê na tela com links de lojas. Quantidades estimadas pela metragem; faixa de preço em reais (mercado brasileiro atual, sem citar loja ou marca específica). Inclua mão de obra como categoria 'servico'.",
          input_schema: {
            type: "object",
            properties: {
              itens: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    categoria: { type: "string", enum: ["material", "acabamento", "movel", "decoracao", "iluminacao", "servico"] },
                    item: { type: "string", description: "Nome do item, ex.: Porcelanato acetinado 60x60" },
                    especificacao: { type: "string", description: "Cor, tamanho, acabamento." },
                    quantidade: { type: "number" },
                    unidade: { type: "string", description: "m², un, galão 18L, caixa…" },
                    preco_min: { type: "number", description: "Total mínimo estimado em R$ para a quantidade." },
                    preco_max: { type: "number", description: "Total máximo estimado em R$ para a quantidade." },
                    termo_busca: { type: "string", description: "Termo curto e genérico pra buscar em loja, ex.: porcelanato acetinado 60x60 cinza" },
                    comodo: { type: "string" },
                  },
                  required: ["categoria", "item", "quantidade", "unidade", "preco_min", "preco_max", "termo_busca"],
                },
              },
              observacoes: { type: "string" },
            },
            required: ["itens"],
          },
        },
        run: async (input) => this.saveShoppingList(session.id, input),
      },
    ];

    const system = `Você é o Arquiteto NovoSeminovo, assistente de reforma do site NovoSeminovo (BH). O cliente está vendo o anúncio "${listing.title}" — ${property}, em ${listing.neighborhood ? `${listing.neighborhood}, ` : ""}${listing.city}/${listing.state}, ${formatBRL(Number(listing.price))}.
Objetivo: ajudar o cliente a enxergar o potencial do imóvel — o que dá pra mudar, quanto custa por alto e como ficaria.

Fotos do anúncio (use os ids nas ferramentas):
${photos.map((photo, index) => `- ${photo.id}: foto ${index + 1}${photo.caption ? ` — ${photo.caption}` : ""}`).join("\n") || "- (sem fotos)"}

Como conversar:
- Português do Brasil, tom de arquiteto acessível, respostas curtas (até ~8 linhas). Pode usar listas com "-" e **negrito**; nada de títulos (#) nem tabelas.
- Entenda estilo, orçamento, quem vai morar e o que incomoda; no máximo 1–2 perguntas por vez.
- Olhe a foto (ver_foto) antes de opinar sobre um cômodo. Se o cliente selecionou uma foto na tela, ela vem indicada no começo da mensagem.
- Para mostrar como ficaria, use gerar_imagem_reforma. Restam ${imagesLeft} de ${DAILY_IMAGES} imagens hoje para este cliente — não gaste à toa${imagesLeft === 0 ? " (acabaram: explique e descreva em palavras; amanhã renova)" : ""}.
- Por padrão proponha mudanças não estruturais (piso, pintura, marcenaria, iluminação, móveis). Derrubar/abrir parede, mexer em hidráulica, elétrica ou fachada: diga que exige avaliação de engenheiro ou arquiteto (CREA/CAU) e, em apartamento, autorização do condomínio — pode ilustrar como conceito.
- Quando a proposta estiver combinada (ou o cliente pedir), use salvar_lista_de_compras. Quantidades e preços são estimativas — diga isso; a metragem total do imóvel é ${details ? Number(details.areaM2) : "desconhecida"} m² e a foto não dá medidas exatas.
- Valorização: fale em termos gerais (reforma bem feita costuma ajudar na venda/aluguel); nunca prometa percentual nem invente dados de mercado.
- Imagens são ilustrativas, não são projeto.`;

    // Lista de compras grande + raciocínio da IA cabem com folga — com pouco
    // espaço a resposta era cortada no meio da ferramenta.
    return { system, tools, maxTokens: 12000 };
  }

  private async generateImage(session: SessionRow, userId: string, photoId: string, instructions: string, summary: string) {
    if (!this.gemini.isEnabled()) throw new Error("A geração de imagens ainda não está ligada no site. Descreva a proposta em palavras.");
    const used = await this.imagesUsedToday(userId);
    if (used >= DAILY_IMAGES) throw new Error(`O cliente já usou as ${DAILY_IMAGES} imagens de hoje. Descreva em palavras; amanhã renova.`);
    const photo = session.listing.photos.find((item) => item.id === photoId);
    if (!photo) throw new Error("Foto não encontrada neste anúncio.");

    const source = await sharp(await readPhotoBytes(photo.url)).rotate().resize(1536, 1536, { fit: "inside" }).jpeg({ quality: 88 }).toBuffer();
    const result = await this.gemini.renovate(source, "image/jpeg", instructions);
    const jpeg = await sharp(result.image).jpeg({ quality: 85 }).toBuffer();
    const url = await getPhotoStorage().save(jpeg, "reforma.jpg", "image/jpeg");
    const image = await this.prisma.architectImage.create({
      data: { sessionId: session.id, userId, photoId: photo.id, sourceUrl: photo.url, instructions: summary.slice(0, 300), resultUrl: url },
    });
    return { ok: true, imagem_id: image.id, imagens_restantes_hoje: Math.max(0, DAILY_IMAGES - used - 1), nota: "A imagem já aparece na tela do cliente." };
  }

  private async saveShoppingList(sessionId: string, input: Record<string, unknown>) {
    const raw = Array.isArray(input.itens) ? (input.itens as Record<string, unknown>[]) : [];
    const items = raw
      .map((item) =>
        ArchitectShoppingItemSchema.safeParse({
          category: item.categoria,
          name: item.item,
          spec: item.especificacao || undefined,
          quantity: Number(item.quantidade),
          unit: item.unidade,
          priceMin: Math.round(Number(item.preco_min)),
          priceMax: Math.round(Math.max(Number(item.preco_max), Number(item.preco_min))),
          searchTerm: item.termo_busca,
          room: item.comodo || undefined,
        }),
      )
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data!)
      .slice(0, 60);
    if (items.length === 0) throw new Error("Nenhum item válido na lista.");
    const list: ArchitectShoppingList = { items, notes: typeof input.observacoes === "string" ? input.observacoes.slice(0, 1000) : undefined, updatedAt: new Date().toISOString() };
    await this.prisma.architectSession.update({ where: { id: sessionId }, data: { shoppingList: list as unknown as Prisma.InputJsonValue } });
    const min = items.reduce((sum, item) => sum + item.priceMin, 0);
    const max = items.reduce((sum, item) => sum + item.priceMax, 0);
    return { ok: true, itens: items.length, total_estimado: `${formatBRL(min)} a ${formatBRL(max)}`, nota: "A lista já aparece na tela do cliente." };
  }

  // Link de loja da lista: conta o clique e devolve o endereço da busca
  // (com o código de afiliado, quando configurado).
  async trackClick(sessionId: string, itemIndex: number, store: ArchitectStoreId, userId?: string): Promise<string> {
    const session = await this.prisma.architectSession.findUnique({ where: { id: sessionId }, select: { id: true, userId: true, shoppingList: true } });
    const item = (session?.shoppingList as unknown as ArchitectShoppingList | null)?.items[itemIndex];
    if (!session || !item) throw new NotFoundException("Item não encontrado.");
    await this.prisma.affiliateClick.create({ data: { sessionId: session.id, userId: userId ?? session.userId, store, query: item.searchTerm.slice(0, 200) } });
    return storeSearchUrl(store, item.searchTerm);
  }

  async stats() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [sessions, images, clicks] = await Promise.all([
      this.prisma.architectSession.count({ where: { createdAt: { gte: since } } }),
      this.prisma.architectImage.count({ where: { createdAt: { gte: since } } }),
      this.prisma.affiliateClick.groupBy({ by: ["store"], where: { createdAt: { gte: since } }, _count: true }),
    ]);
    return { sessions, images, clicksByStore: clicks.map((row) => ({ store: row.store, clicks: row._count })) };
  }

  private async toView(session: SessionRow, userId: string): Promise<ArchitectSessionView> {
    const listing = session.listing;
    const used = await this.imagesUsedToday(userId);
    return {
      id: session.id,
      listing: {
        id: listing.id,
        title: listing.title,
        location: listing.neighborhood ? `${listing.neighborhood}, ${listing.city} - ${listing.state}` : `${listing.city} - ${listing.state}`,
        priceLabel: formatBRL(Number(listing.price)),
      },
      photos: listing.photos.map((photo) => ({ id: photo.id, url: photo.url, caption: photo.caption ?? undefined })),
      // A marcação da foto escolhida é só pra IA — some da bolha do cliente.
      messages: visibleMessages((session.messages as unknown as Anthropic.MessageParam[]) ?? []).map((message) =>
        message.role === "user" ? { ...message, text: message.text.replace(/^\[Foto selecionada na tela:[^\]]*\]\n/, "") } : message,
      ),
      images: session.images.map((image) => ({
        id: image.id,
        photoId: image.photoId ?? undefined,
        sourceUrl: image.sourceUrl,
        resultUrl: image.resultUrl,
        instructions: image.instructions,
        createdAt: image.createdAt.toISOString(),
      })),
      shoppingList: (session.shoppingList as unknown as ArchitectShoppingList | null) ?? undefined,
      imagesLeftToday: Math.max(0, DAILY_IMAGES - used),
      dailyImageLimit: DAILY_IMAGES,
      imageGenerationEnabled: this.gemini.isEnabled(),
    };
  }
}
