import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Prisma } from "@novoseminovo/db";
import { type Acquisition, campaignKey, META_LEAD_FORM_MEDIUM } from "@novoseminovo/shared-types";
import { ContactsService } from "../marketing/contacts.service";
import { trackRoutine } from "../operations/routine-health";
import { PrismaService } from "../prisma/prisma.service";
import { CAMPAIGN_SEGMENT, SalesService } from "../sales/sales.service";
import {
  businessTypeOf,
  fetchFormName,
  fetchLead,
  guessInterest,
  isB2BLead,
  listFormLeads,
  listPageForms,
  mapLeadFields,
  metaLeadsConfig,
  MetaGraphError,
  plainLower,
  rememberFormName,
  type GraphLead,
  type LeadgenChange,
  type MetaLeadsConfig,
} from "./meta-leads";

export const META_LEAD_CONSENT_TEXT = "Formulário de Lead Ads da Meta (política de privacidade do NovoSeminovo no formulário)";
const SYNC_MS = 30 * 60_000;
const SYNC_WINDOW_MS = 24 * 3_600_000;
// "processing" parado há mais que isso (API caiu no meio): pode tentar de novo.
const STALE_MS = 15 * 60_000;

export type LeadOutcome = "b2b" | "comprador" | "repetido" | "sem_contato" | "erro" | "desligado";

// Recebe os leads dos formulários de Lead Ads (webhook e rotina de segurança),
// lê os dados na Graph API e manda para o lugar certo do CRM. Cada leadgen_id
// é processado uma vez só (tabela meta_leadgens). Falha da Meta não marca o
// lead: a Meta reenvia o webhook e a rotina de 30 em 30 minutos pega de novo.
@Injectable()
export class MetaLeadsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetaLeadsService.name);
  private readonly pending = new Set<Promise<unknown>>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly contacts: ContactsService,
  ) {}

  config(): MetaLeadsConfig {
    return metaLeadsConfig();
  }

  // Webhook: responde na hora e processa depois. Devolve quantos entraram na fila.
  receive(changes: LeadgenChange[]): number {
    const config = this.config();
    let queued = 0;
    for (const change of changes) {
      if (config.pageId && change.pageId !== config.pageId) {
        this.logger.warn(`Lead Ads: webhook de outra página (${change.pageId}) ignorado.`);
        continue;
      }
      queued++;
      this.track(this.process(change.leadgenId, { pageId: change.pageId, formId: change.formId }));
    }
    return queued;
  }

  // Para os testes (e para desligar a API sem perder lead no meio).
  async idle(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  private track(work: Promise<unknown>): void {
    const tracked = work.catch(() => undefined).finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
  }

  // Marca o lead como "em processamento". false = já foi (ou está sendo) processado.
  private async claim(leadgenId: string, pageId?: string, formId?: string): Promise<boolean> {
    try {
      await this.prisma.metaLeadgen.create({ data: { leadgenId, pageId, formId, status: "processing" } });
      return true;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const retaken = await this.prisma.metaLeadgen.updateMany({
        where: { leadgenId, status: "processing", updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
        data: { updatedAt: new Date() },
      });
      return retaken.count === 1;
    }
  }

  async process(leadgenId: string, hint: { pageId?: string; formId?: string } = {}, prefetched?: GraphLead): Promise<LeadOutcome> {
    const config = this.config();
    if (!config.pageToken) {
      this.logger.warn("Lead Ads: lead recebido, mas falta secrets/meta_page_token para ler os dados (a rotina de segurança pega depois).");
      return "desligado";
    }
    if (!(await this.claim(leadgenId, hint.pageId, hint.formId))) return "repetido";
    const graph = { ...config, pageToken: config.pageToken };
    try {
      const lead = prefetched ?? (await fetchLead(graph, leadgenId));
      const formId = lead.form_id ?? hint.formId;
      const formName = await fetchFormName(graph, formId);
      const outcome = await this.route(lead, formName, config);
      await this.prisma.metaLeadgen.update({
        where: { leadgenId },
        data: { status: outcome === "sem_contato" ? "skipped" : "done", route: outcome === "sem_contato" ? null : outcome, formId: formId ?? null },
      });
      return outcome;
    } catch (error) {
      // Sem marcar: a próxima tentativa (Meta ou rotina) processa.
      await this.prisma.metaLeadgen.deleteMany({ where: { leadgenId, status: "processing" } }).catch(() => undefined);
      const reason = error instanceof MetaGraphError ? error.message : (error as Error).name;
      this.logger.warn(`Lead Ads: não consegui processar o lead ${leadgenId}: ${reason}`);
      return "erro";
    }
  }

  private async route(lead: GraphLead, formName: string | undefined, config: MetaLeadsConfig): Promise<LeadOutcome> {
    const fields = mapLeadFields(lead.field_data);
    if (!fields.email && !fields.phone) {
      this.logger.warn(`Lead Ads: lead ${lead.id} sem e-mail e sem telefone — ignorado.`);
      return "sem_contato";
    }
    const campaign = campaignKey(lead.campaign_name);
    // Lead orgânico (formulário fora de anúncio pago): canal da plataforma.
    const source: Acquisition["source"] = lead.is_organic ? (lead.platform === "fb" ? "facebook" : "instagram") : "meta_ads";
    const acquisition: Acquisition = {
      source,
      medium: META_LEAD_FORM_MEDIUM,
      ...(campaign ? { campaign } : {}),
      ...(lead.ad_name ? { content: lead.ad_name } : {}),
      ...(lead.adset_name ? { term: lead.adset_name } : {}),
    };
    const names = `${formName ?? ""} ${lead.campaign_name ?? ""}`;

    if (isB2BLead({ formName, campaignName: lead.campaign_name, fields }, config.b2bWords)) {
      const businessType = fields.businessType ?? businessTypeOf(names);
      const segment = businessType ? CAMPAIGN_SEGMENT[businessType] : /(imobili|corretor|imove|imovel)/.test(plainLower(names)) ? "property" : "vehicle";
      await this.sales.recordCampaignLead(
        {
          name: fields.name ?? fields.company ?? "Lead do formulário da Meta",
          segment,
          company: fields.company,
          businessType,
          city: fields.city,
          state: fields.state,
          phone: fields.phone,
          email: fields.email,
          cnpj: fields.cnpj,
          contactRole: fields.jobTitle,
        },
        acquisition,
        {
          heading: `Formulário do Instagram/Facebook: ${formName ?? "sem nome"}`,
          detailsOnNextLine: true,
          consentText: META_LEAD_CONSENT_TEXT,
          taskNote: "Veio de um formulário de anúncio do Instagram/Facebook.",
        },
      );
      return "b2b";
    }

    const result = await this.contacts.upsert({
      email: fields.email,
      phone: fields.phone,
      name: fields.name,
      interest: guessInterest(names),
      source: "meta_lead_ads",
      sourceDetail: `formulario:${campaign ?? "sem_campanha"}`,
      consent: "legitimate_interest",
      consentText: META_LEAD_CONSENT_TEXT,
      acquisition,
    });
    if (!result) return "sem_contato";
    return "comprador";
  }

  // Rotina de segurança: leads das últimas 24h que o webhook não trouxe.
  async syncRecent(now = Date.now()): Promise<{ processed: number }> {
    const config = this.config();
    if (config.syncDisabled || !config.pageToken || !config.pageId) return { processed: 0 };
    const graph = { ...config, pageToken: config.pageToken };
    const since = Math.floor((now - SYNC_WINDOW_MS) / 1000);
    let processed = 0;
    const forms = await listPageForms(graph, config.pageId);
    for (const form of forms) {
      rememberFormName(form.id, form.name);
      let leads: GraphLead[];
      try {
        leads = await listFormLeads(graph, form.id, since);
      } catch (error) {
        this.logger.warn(`Lead Ads: não consegui listar os leads do formulário ${form.id}: ${error instanceof MetaGraphError ? error.message : (error as Error).name}`);
        continue;
      }
      if (!leads.length) continue;
      const seen = new Set(
        (await this.prisma.metaLeadgen.findMany({ where: { leadgenId: { in: leads.map((l) => l.id) }, status: { not: "processing" } }, select: { leadgenId: true } })).map((r) => r.leadgenId),
      );
      for (const lead of leads) {
        if (seen.has(lead.id)) continue;
        const outcome = await this.process(lead.id, { pageId: config.pageId, formId: form.id }, { ...lead, form_id: lead.form_id ?? form.id });
        if (outcome === "b2b" || outcome === "comprador" || outcome === "sem_contato") processed++;
      }
    }
    if (processed) this.logger.log(`Lead Ads: rotina de segurança trouxe ${processed} lead(s) que o webhook não entregou.`);
    return { processed };
  }

  onModuleInit(): void {
    if (process.env.META_LEADS_SYNC_DISABLED === "1") return;
    const run = () => {
      const config = this.config();
      // Sem configuração não há rotina (nem batimento no painel de operações).
      if (!config.pageToken || !config.pageId) return;
      void trackRoutine("meta-lead-ads", SYNC_MS, () => this.syncRecent());
    };
    setTimeout(run, 2 * 60_000).unref();
    this.timer = setInterval(run, SYNC_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.idle();
  }
}
