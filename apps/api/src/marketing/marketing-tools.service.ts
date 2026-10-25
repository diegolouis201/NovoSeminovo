import { Injectable, OnModuleInit } from "@nestjs/common";
import { z } from "zod";
import { EMAIL_STEP_CONDITIONS, EmailCampaignInputSchema, MARKETING_INTERESTS, MarketingPostInputSchema, formatBRL } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { OpsToolsService } from "../operations/tools.service";
import type { OpsToolContext } from "../operations/policy";
import { EmailMarketingService } from "./email-marketing.service";
import { MarketingPostsService } from "./posts.service";
import { MarketingService } from "./marketing.service";

const DAY_MS = 24 * 60 * 60 * 1000;
// Rascunhos que o agente pode criar: segura um laço antes de virar fila de aprovação lotada.
const MAX_POSTS_PER_TASK = 3;
const MAX_POSTS_PER_DAY = 6;
const MAX_CAMPAIGNS_PER_DAY = 2;
const INTERESTS = Object.keys(MARKETING_INTERESTS) as [keyof typeof MARKETING_INTERESTS, ...(keyof typeof MARKETING_INTERESTS)[]];
const BACKGROUNDS = { anuncio: "listing", ia: "ai", marca: "brand" } as const;

const postFields = {
  titulo: z.string().trim().min(3).max(120),
  legenda: z.string().trim().min(10).max(2000),
  hashtags: z.array(z.string()).max(15),
  texto_complementar: z.string().trim().max(1000).optional(),
  fundo: z.enum(["anuncio", "ia", "marca"]),
  titulo_arte: z.string().trim().min(3).max(90),
  subtitulo_arte: z.string().trim().max(120).optional(),
  anuncio_id: z.string().trim().max(40).optional(),
  descricao_imagem: z.string().trim().max(600).optional(),
};
const postSchemaProps = {
  titulo: { type: "string", description: "Nome interno do post (para o dono reconhecer)." },
  legenda: { type: "string", description: "Legenda pronta, até ~1.200 caracteres, com chamada para ação e o endereço novoseminovo.com.br. Sem hashtags aqui." },
  hashtags: { type: "array", items: { type: "string" }, description: "5 a 12 hashtags relevantes em português." },
  texto_complementar: { type: "string", description: "Opcional: texto para stories ou primeiro comentário." },
  fundo: { type: "string", enum: ["anuncio", "ia", "marca"], description: "anuncio = foto real de um anúncio (anuncio_id); ia = imagem gerada (descricao_imagem); marca = fundo azul da marca." },
  titulo_arte: { type: "string", description: "Frase curta escrita na arte (até 60 caracteres é o ideal)." },
  subtitulo_arte: { type: "string", description: "Linha de apoio na arte (opcional, até 80 caracteres)." },
  anuncio_id: { type: "string" },
  descricao_imagem: { type: "string", description: "Cena da imagem gerada, sem texto nem placas (ex.: família feliz ao lado de um SUV numa rua arborizada)." },
};
const POST_REQUIRED = ["titulo", "legenda", "hashtags", "fundo", "titulo_arte"];

type PostToolInput = z.infer<z.ZodObject<typeof postFields>>;

function toPostInput(input: PostToolInput) {
  return MarketingPostInputSchema.parse({
    title: input.titulo,
    caption: input.legenda,
    hashtags: input.hashtags.map((tag) => tag.replace(/\s+/g, "")).filter((tag) => /^#?[\p{L}\p{N}_]{2,40}$/u.test(tag)),
    extraText: input.texto_complementar,
    artSource: BACKGROUNDS[input.fundo],
    artHeadline: input.titulo_arte,
    artSubline: input.subtitulo_arte,
    listingId: input.anuncio_id,
    artPrompt: input.descricao_imagem,
  });
}

const campaignFields = {
  nome: z.string().trim().min(3).max(120),
  assunto: z.string().trim().min(3).max(120),
  preheader: z.string().trim().max(150).optional(),
  texto: z.string().trim().min(20).max(5000),
  botao_texto: z.string().trim().max(40).optional(),
  botao_link: z.string().trim().max(300).optional(),
  interesses: z.array(z.enum(INTERESTS)).max(5),
};
const campaignSchemaProps = {
  nome: { type: "string" },
  assunto: { type: "string", description: "Assunto curto e honesto, sem caixa alta nem promessas. Pode usar {{nome}}." },
  preheader: { type: "string", description: "Frase que aparece ao lado do assunto na caixa de entrada." },
  texto: { type: "string", description: "Corpo em texto simples; linha em branco separa parágrafos; {{nome}} vira o primeiro nome." },
  botao_texto: { type: "string" },
  botao_link: { type: "string", description: "Página do site, ex.: /carros, /imoveis, /anunciar, /para-lojas." },
  interesses: { type: "array", items: { type: "string", enum: INTERESTS }, description: "Público pelo interesse do contato; lista vazia = todos com permissão." },
};
type CampaignToolInput = z.infer<z.ZodObject<typeof campaignFields>>;

function toCampaignInput(input: CampaignToolInput) {
  return EmailCampaignInputSchema.parse({
    name: input.nome,
    subject: input.assunto,
    preheader: input.preheader,
    body: input.texto,
    ctaLabel: input.botao_texto,
    ctaUrl: input.botao_link,
    interests: input.interesses,
  });
}

const stepSchema = z.object({
  dias_depois: z.number().int().min(0).max(60),
  assunto: z.string().trim().min(3).max(120),
  preheader: z.string().trim().max(150).optional(),
  texto: z.string().trim().min(20).max(3000),
  botao_texto: z.string().trim().max(40).optional(),
  botao_link: z.string().trim().max(300).optional(),
  condicao: z.enum(Object.keys(EMAIL_STEP_CONDITIONS) as [keyof typeof EMAIL_STEP_CONDITIONS]).optional(),
});

// Ferramentas do agente de Marketing para a operação de ponta a ponta. Todas
// são "verdes" porque só criam rascunhos: publicar no Instagram e enviar
// e-mail dependem da aprovação do dono na tela /admin/marketing.
@Injectable()
export class MarketingToolsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: OpsToolsService,
    private readonly posts: MarketingPostsService,
    private readonly emails: EmailMarketingService,
    private readonly marketing: MarketingService,
  ) {}

  onModuleInit(): void {
    this.tools.register({
      name: "ler_resultados_marketing",
      color: "green",
      description:
        "Resultados do marketing nos últimos 30 dias: posts publicados e métricas (alcance, curtidas, comentários, salvos), e-mails enviados, entregues, cliques, descadastros, leads e cadastros vindos de e-mail, contatos por origem e interesse, e o que está esperando aprovação.",
      input: z.object({}),
      schema: { type: "object", properties: {} },
      run: async () => this.marketing.agentReport(),
    });

    this.tools.register({
      name: "listar_anuncios_para_post",
      color: "green",
      description: "Anúncios ativos com boas fotos (5 ou mais) para usar como fundo de post, mais recentes primeiro.",
      input: z.object({ segmento: z.enum(["vehicle", "property"]).optional(), limite: z.number().int().min(1).max(20).optional() }),
      schema: {
        type: "object",
        properties: { segmento: { type: "string", enum: ["vehicle", "property"] }, limite: { type: "integer", minimum: 1, maximum: 20 } },
      },
      run: async ({ segmento, limite }) => {
        const listings = await this.prisma.listing.findMany({
          where: { status: "active", ...(segmento ? { type: segmento } : {}), photos: { some: {} } },
          select: { id: true, title: true, type: true, price: true, city: true, state: true, _count: { select: { photos: true } } },
          orderBy: { publishedAt: "desc" },
          take: 60,
        });
        return {
          anuncios: listings
            .filter((listing) => listing._count.photos >= 5)
            .slice(0, limite ?? 10)
            .map((listing) => ({
              id: listing.id,
              titulo: listing.title,
              tipo: listing.type,
              preco: formatBRL(Number(listing.price)),
              cidade: `${listing.city}/${listing.state}`,
              fotos: listing._count.photos,
              link: `/anuncio/${listing.id}`,
            })),
        };
      },
    });

    this.tools.register({
      name: "criar_post_instagram",
      color: "green",
      description:
        "Cria o rascunho de um post do Instagram com arte 1080×1350 (fundo + título na fonte da marca + logo), legenda e hashtags. Vai para a aprovação do dono; nada é publicado sem ele aprovar. Use sugestao_id quando o post vier de uma sugestão.",
      input: z.object({ ...postFields, sugestao_id: z.string().trim().max(40).optional() }),
      schema: { type: "object", properties: { ...postSchemaProps, sugestao_id: { type: "string" } }, required: POST_REQUIRED },
      run: async (input, context) => {
        await this.checkPostLimits(context);
        const { post, fallback } = await this.posts.create({ ...toPostInput(input), suggestionId: input.sugestao_id, taskId: context.taskId }, "agent");
        return { postId: post.id, status: "esperando aprovação do dono", aviso: fallback ? `O fundo pedido não deu certo (${fallback}); a arte saiu com o fundo da marca.` : undefined };
      },
    });

    this.tools.register({
      name: "revisar_post_instagram",
      color: "green",
      description: "Refaz um post em que o dono pediu alteração (status changes_requested). Mande o post inteiro já com as mudanças pedidas.",
      input: z.object({ post_id: z.string().min(5).max(40), ...postFields }),
      schema: { type: "object", properties: { post_id: { type: "string" }, ...postSchemaProps }, required: ["post_id", ...POST_REQUIRED] },
      run: async (input) => {
        const { post, fallback } = await this.posts.update(input.post_id, toPostInput(input), "agent");
        return { postId: post.id, versao: post.revision, aviso: fallback ? `Fundo pedido falhou (${fallback}); usei o da marca.` : undefined };
      },
    });

    this.tools.register({
      name: "criar_campanha_email",
      color: "green",
      description:
        "Cria o rascunho de uma campanha de e-mail para os contatos com permissão (filtrados por interesse). Vai para a aprovação do dono; nada é enviado sem ele aprovar. O rodapé com o motivo do envio e o descadastro entra sozinho.",
      input: z.object(campaignFields),
      schema: { type: "object", properties: campaignSchemaProps, required: ["nome", "assunto", "texto", "interesses"] },
      run: async (input, context) => {
        const today = await this.prisma.emailCampaign.count({ where: { taskId: { not: null }, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
        if (today >= MAX_CAMPAIGNS_PER_DAY) throw new Error(`Limite de ${MAX_CAMPAIGNS_PER_DAY} campanhas de e-mail por dia`);
        const campaign = await this.emails.createCampaign(toCampaignInput(input), "agent", context.taskId ?? "agente");
        return { campanhaId: campaign.id, publicoComPermissao: await this.emails.audienceSize({ interests: input.interesses }), status: "esperando aprovação do dono" };
      },
    });

    this.tools.register({
      name: "revisar_campanha_email",
      color: "green",
      description: "Refaz uma campanha em que o dono pediu alteração. Mande a campanha inteira já com as mudanças.",
      input: z.object({ campanha_id: z.string().min(5).max(40), ...campaignFields }),
      schema: { type: "object", properties: { campanha_id: { type: "string" }, ...campaignSchemaProps }, required: ["campanha_id", "nome", "assunto", "texto", "interesses"] },
      run: async (input) => {
        const campaign = await this.emails.updateCampaign(input.campanha_id, toCampaignInput(input), "agent");
        return { campanhaId: campaign.id, status: "esperando aprovação do dono" };
      },
    });

    this.tools.register({
      name: "propor_sequencia",
      color: "green",
      description:
        "Propõe (ou refaz) uma sequência automática de e-mails para contatos NOVOS de um interesse: boas-vindas e acompanhamento. Cada passo tem dias_depois (contados do passo anterior; o primeiro, da entrada do contato) e condicao opcional (sempre, sem_conta, com_conta). A sequência para sozinha quando o contato se descadastra, o e-mail volta ou ele converte. Só começa depois que o dono aprovar.",
      input: z.object({
        chave: z.string().trim().regex(/^[a-z0-9_-]{3,40}$/),
        nome: z.string().trim().min(3).max(120),
        interesses: z.array(z.enum(INTERESTS)).max(5),
        passos: z.array(stepSchema).min(1).max(6),
      }),
      schema: {
        type: "object",
        properties: {
          chave: { type: "string", description: "Identificador fixo, ex.: comprador_carro, comprador_imovel, vendedor, loja, geral." },
          nome: { type: "string" },
          interesses: { type: "array", items: { type: "string", enum: INTERESTS } },
          passos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                dias_depois: { type: "integer", minimum: 0, maximum: 60 },
                assunto: { type: "string" },
                preheader: { type: "string" },
                texto: { type: "string" },
                botao_texto: { type: "string" },
                botao_link: { type: "string" },
                condicao: { type: "string", enum: Object.keys(EMAIL_STEP_CONDITIONS) },
              },
              required: ["dias_depois", "assunto", "texto"],
            },
          },
        },
        required: ["chave", "nome", "interesses", "passos"],
      },
      run: async ({ chave, nome, interesses, passos }, context) => {
        const steps = passos.map((step) => ({
          delayDays: step.dias_depois,
          subject: step.assunto,
          preheader: step.preheader,
          body: step.texto,
          ctaLabel: step.botao_texto,
          ctaUrl: step.botao_link,
          condition: step.condicao,
        }));
        for (const step of steps) {
          if (step.ctaUrl && !/^\/|novoseminovo\.com\.br/.test(step.ctaUrl)) throw new Error("Os links precisam ser páginas do novoseminovo.com.br");
        }
        const sequence = await this.emails.proposeSequence({ key: chave, name: nome, interests: interesses, steps }, context.taskId);
        return { sequenciaId: sequence.id, status: "esperando aprovação do dono" };
      },
    });
  }

  private async checkPostLimits(context: OpsToolContext): Promise<void> {
    if (context.taskId) {
      const count = await this.prisma.marketingPost.count({ where: { taskId: context.taskId } });
      if (count >= MAX_POSTS_PER_TASK) throw new Error(`Limite de ${MAX_POSTS_PER_TASK} posts por tarefa`);
    }
    const today = await this.prisma.marketingPost.count({ where: { taskId: { not: null }, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
    if (today >= MAX_POSTS_PER_DAY) throw new Error(`Limite de ${MAX_POSTS_PER_DAY} posts criados por dia`);
  }
}
