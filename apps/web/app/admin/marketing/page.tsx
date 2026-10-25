import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ACQUISITION_SOURCES,
  EMAIL_CAMPAIGN_STATUS_LABELS,
  EMAIL_SEQUENCE_STATUS_LABELS,
  EMAIL_STEP_CONDITIONS,
  MARKETING_CONSENT_LABELS,
  MARKETING_INTERESTS,
  MARKETING_POST_STATUS_LABELS,
  type EmailCampaignView,
  type EmailSequenceView,
  type MarketingPostView,
  type MarketingSummary,
} from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { mktDecisionAction, mktRefreshMetricsAction, mktSaveCampaignAction, mktSavePostAction } from "@/lib/actions/marketing";
import { opsRunAgentAction } from "@/lib/actions/operations";
import { fetchMarketingSummary } from "@/lib/api";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "posts", label: "Posts do Instagram" },
  { key: "email", label: "Campanhas de e-mail" },
  { key: "sequencias", label: "Sequências automáticas" },
  { key: "contatos", label: "Contatos" },
  { key: "resultados", label: "Resultados" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const ART_SOURCES: Record<string, string> = { listing: "Foto de um anúncio", ai: "Imagem gerada por IA", brand: "Fundo da marca" };
const STAGE_LABELS: Record<string, string> = { novo: "Novo", cadastrado: "Criou conta", cliente: "Converteu" };
const CONTACT_STATUS: Record<string, string> = { active: "Ativo", unsubscribed: "Descadastrado", bounced: "E-mail voltou", complained: "Marcou como spam" };
const OPEN = ["awaiting_approval", "changes_requested", "failed"];

const input = "w-full rounded-brand border border-border bg-surface-page px-3 py-2 text-sm text-ink placeholder:text-ink-muted";

function dateTime(iso: string | undefined): string {
  return iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
}

function number(value: number): string {
  return value.toLocaleString("pt-BR");
}

function interestLabel(key: string): string {
  return MARKETING_INTERESTS[key as keyof typeof MARKETING_INTERESTS] ?? key;
}

function sourceLabel(key: string): string {
  return ACQUISITION_SOURCES[key as keyof typeof ACQUISITION_SOURCES] ?? key;
}

export default async function MarketingPage({ searchParams }: { searchParams: { aba?: string; sucesso?: string; erro?: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/entrar");
  if (session.user.role !== "admin") redirect("/admin");
  const data = await fetchMarketingSummary(session.accessToken);
  const tab: Tab = (TABS.find((item) => item.key === searchParams.aba)?.key ?? "posts") as Tab;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12">
      <header>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Link href="/admin" className="text-sm font-semibold text-brand-blue hover:underline">
            ← Moderação
          </Link>
          <Link href="/admin/operacao#marketing" className="text-sm font-semibold text-brand-blue hover:underline">
            Sugestões do agente (Operação com IA)
          </Link>
        </div>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Marketing</h1>
        <p className="max-w-3xl text-sm text-ink-muted">
          O agente de Marketing cria posts, campanhas e sequências de e-mail. Você vê a prévia e decide: aprovar, agendar, pedir alteração (o agente refaz) ou
          rejeitar. Nada é publicado no Instagram nem enviado por e-mail sem a sua aprovação.
        </p>
      </header>

      {searchParams.erro && <p className="rounded-brand bg-status-danger/10 px-4 py-3 text-sm text-status-danger">{searchParams.erro}</p>}
      {searchParams.sucesso && <p className="rounded-brand bg-surface-sober px-4 py-3 text-sm text-ink">{searchParams.sucesso}</p>}

      {!data ? (
        <p className="text-sm text-status-danger">Não foi possível carregar o marketing agora. Tente de novo em instantes.</p>
      ) : (
        <>
          <Integrations data={data} />
          <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
            {TABS.map((item) => {
              const pending = pendingCount(data, item.key);
              return (
                <Link
                  key={item.key}
                  href={`/admin/marketing?aba=${item.key}`}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === item.key ? "bg-brand-blue text-on-blue" : "bg-surface-sober text-ink hover:opacity-80"}`}
                >
                  {item.label}
                  {pending > 0 && <span className="ml-2 rounded-full bg-brand-orange px-2 text-xs text-on-orange">{pending}</span>}
                </Link>
              );
            })}
          </nav>
          {tab === "posts" && <Posts data={data} />}
          {tab === "email" && <Campaigns data={data} />}
          {tab === "sequencias" && <Sequences data={data} />}
          {tab === "contatos" && <Contacts data={data} />}
          {tab === "resultados" && <Results data={data} />}
        </>
      )}
    </main>
  );
}

function pendingCount(data: MarketingSummary, tab: Tab): number {
  if (tab === "posts") return data.posts.filter((post) => post.status === "awaiting_approval").length;
  if (tab === "email") return data.campaigns.filter((campaign) => campaign.status === "awaiting_approval").length;
  if (tab === "sequencias") return data.sequences.filter((sequence) => sequence.status === "awaiting_approval").length;
  return 0;
}

function Integrations({ data }: { data: MarketingSummary }) {
  const items = [
    { ok: data.integrations.instagram, label: "Publicação no Instagram", missing: "falta o token da Meta (posts aprovados ficam esperando)" },
    { ok: data.integrations.email, label: "Envio de e-mail", missing: "falta a chave do Resend" },
    { ok: data.integrations.emailWebhook, label: "Entregas e devoluções de e-mail", missing: "falta o webhook do Resend (sem ele não sabemos o que foi entregue ou voltou)" },
    { ok: data.integrations.images, label: "Imagens geradas por IA", missing: "falta a chave do Gemini (artes usam foto de anúncio ou fundo da marca)" },
  ];
  return (
    <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className={`rounded-brand border p-3 text-xs ${item.ok ? "border-border bg-surface-raised" : "border-brand-orange bg-surface-raised"}`}>
          <p className="font-bold text-ink">
            {item.ok ? "✓" : "!"} {item.label}
          </p>
          <p className="mt-1 text-ink-muted">{item.ok ? "Ligado" : item.missing}</p>
        </div>
      ))}
      <p className="text-xs text-ink-muted sm:col-span-2 lg:col-span-4">
        E-mails hoje: {data.emailSentToday} de {data.emailDailyLimit} (o que passar do limite sai no dia seguinte).
      </p>
    </section>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "wait" | "ok" | "bad" | "neutral" }) {
  const tones = {
    wait: "bg-brand-orange text-on-orange",
    ok: "bg-brand-green text-on-green",
    bad: "bg-status-danger text-white",
    neutral: "bg-surface-sober text-ink",
  };
  return <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${tones[tone]}`}>{label}</span>;
}

function toneFor(status: string): "wait" | "ok" | "bad" | "neutral" {
  if (status === "awaiting_approval") return "wait";
  if (["published", "sent", "active", "approved", "scheduled", "sending", "publishing"].includes(status)) return "ok";
  if (["failed", "rejected"].includes(status)) return "bad";
  return "neutral";
}

function DecisionForm({ kind, id, status, schedule = true }: { kind: "posts" | "campaigns" | "sequences"; id: string; status: string; schedule?: boolean }) {
  const action = mktDecisionAction.bind(null, kind, id);
  const live = ["approved", "scheduled", "active"].includes(status);
  if (!OPEN.includes(status) && !live) return null;
  return (
    <form action={action} className="flex flex-col gap-2 rounded-brand bg-surface-sober p-3">
      <textarea name="note" rows={2} placeholder="O que mudar? (obrigatório para pedir alteração)" className={input} />
      {schedule && OPEN.includes(status) && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          Agendar para (horário de Brasília)
          <input type="datetime-local" name="scheduledFor" className={`${input} w-auto`} />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {OPEN.includes(status) && (
          <>
            <Button type="submit" name="action" value="approve" className="py-2">
              {kind === "posts" ? "Aprovar e publicar" : kind === "campaigns" ? "Aprovar e enviar" : "Aprovar e ativar"}
            </Button>
            {schedule && (
              <Button type="submit" name="action" value="schedule" variant="secondary" className="py-2">
                Agendar
              </Button>
            )}
            <Button type="submit" name="action" value="changes" variant="ghost" className="py-2">
              Pedir alteração
            </Button>
            <Button type="submit" name="action" value="reject" variant="ghost" className="py-2 text-status-danger">
              Rejeitar
            </Button>
          </>
        )}
        {live && (
          <Button type="submit" name="action" value="pause" variant="ghost" className="py-2">
            {kind === "sequences" ? "Pausar sequência" : "Cancelar e voltar para aprovação"}
          </Button>
        )}
      </div>
    </form>
  );
}

// ---------------- Posts ----------------

function PostForm({ post }: { post?: MarketingPostView }) {
  return (
    <form action={mktSavePostAction.bind(null, post?.id)} className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        Nome interno
        <input name="title" required defaultValue={post?.title} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        Fundo da arte
        <select name="artSource" defaultValue={post?.artSource ?? "brand"} className={input}>
          {Object.entries(ART_SOURCES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        Título na arte
        <input name="artHeadline" required maxLength={90} defaultValue={post?.artHeadline} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        Linha de apoio na arte (opcional)
        <input name="artSubline" maxLength={120} defaultValue={post?.artSubline} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        ID do anúncio (se o fundo for foto de anúncio)
        <input name="listingId" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        Cena da imagem (se o fundo for IA)
        <input name="artPrompt" placeholder="ex.: família ao lado de um SUV numa rua arborizada" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted md:col-span-2">
        Legenda
        <textarea name="caption" required rows={6} defaultValue={post?.caption} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        Hashtags (separadas por espaço)
        <input name="hashtags" defaultValue={post?.hashtags.join(" ")} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        Texto complementar (stories / 1º comentário)
        <input name="extraText" defaultValue={post?.extraText} className={input} />
      </label>
      <div className="md:col-span-2">
        <Button type="submit" className="py-2">
          {post ? "Salvar e gerar nova arte" : "Criar post"}
        </Button>
        <span className="ml-3 text-xs text-ink-muted">Depois de salvar, o post volta para a sua aprovação.</span>
      </div>
    </form>
  );
}

function Posts({ data }: { data: MarketingSummary }) {
  const order = ["awaiting_approval", "changes_requested", "failed", "approved", "scheduled", "publishing", "published", "rejected"];
  const posts = [...data.posts].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <section className="flex flex-col gap-4">
      {/* key: depois de criar, o formulário volta vazio e fechado. */}
      <details key={`novo-post-${data.posts.length}`} className="rounded-brand-lg border border-border bg-surface-raised p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">+ Criar um post você mesmo</summary>
        <div className="mt-4">
          <PostForm />
        </div>
      </details>
      {posts.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nenhum post ainda. O agente de Marketing cria posts na rodada de segunda-feira; em Operação com IA você pode “Rodar agora” ou transformar uma sugestão em post.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {posts.map((post) => (
            <li key={post.id} className={`grid grid-cols-1 gap-4 rounded-brand-lg border bg-surface-raised p-4 md:grid-cols-[280px_1fr] ${post.status === "awaiting_approval" ? "border-2 border-brand-orange" : "border-border"}`}>
              <div>
                {post.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.imageUrl} alt={`Arte do post ${post.title}`} className="aspect-[4/5] w-full rounded-brand object-cover" />
                ) : (
                  <div className="flex aspect-[4/5] items-center justify-center rounded-brand bg-surface-sober text-xs text-ink-muted">Sem arte</div>
                )}
                {post.imageUrl && (
                  <a href={post.imageUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-semibold text-brand-blue hover:underline">
                    Abrir arte em tamanho real
                  </a>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge label={MARKETING_POST_STATUS_LABELS[post.status] ?? post.status} tone={toneFor(post.status)} />
                  <span className="font-semibold text-ink">{post.title}</span>
                  <span className="text-xs text-ink-muted">
                    versão {post.revision} · {ART_SOURCES[post.artSource] ?? post.artSource} · criado {dateTime(post.createdAt)}
                  </span>
                </div>
                {post.scheduledFor && post.status === "scheduled" && <p className="text-xs text-ink">Publica em {dateTime(post.scheduledFor)}</p>}
                {post.status === "approved" && !data.integrations.instagram && (
                  <p className="text-xs text-brand-orange">Aprovado, esperando a integração com o Instagram ser configurada para publicar.</p>
                )}
                {post.igPermalink && (
                  <a href={post.igPermalink} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-blue hover:underline">
                    Ver no Instagram ({dateTime(post.publishedAt)})
                  </a>
                )}
                {post.error && <p className="rounded-brand bg-status-danger/10 px-3 py-2 text-xs text-status-danger">{post.error}</p>}
                {post.feedback && <p className="text-xs text-ink-muted">Seu último pedido: “{post.feedback}”</p>}
                <p className="whitespace-pre-line text-ink">{post.caption}</p>
                {post.hashtags.length > 0 && <p className="text-brand-blue">{post.hashtags.join(" ")}</p>}
                {post.extraText && <p className="text-xs text-ink-muted">Complementar: {post.extraText}</p>}
                {post.metrics && (
                  <p className="text-xs text-ink [font-variant-numeric:tabular-nums]">
                    Alcance {number(post.metrics.reach ?? 0)} · Curtidas {number(post.metrics.likes ?? 0)} · Comentários {number(post.metrics.comments ?? 0)} · Salvos{" "}
                    {number(post.metrics.saved ?? 0)} · Compartilhamentos {number(post.metrics.shares ?? 0)}
                  </p>
                )}
                <DecisionForm kind="posts" id={post.id} status={post.status} />
                {[...OPEN, "approved", "scheduled"].includes(post.status) && (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-brand-blue">Editar você mesmo</summary>
                    <div className="mt-3">
                      <PostForm post={post} />
                    </div>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------- E-mail ----------------

function CampaignForm({ campaign }: { campaign?: EmailCampaignView }) {
  return (
    <form action={mktSaveCampaignAction.bind(null, campaign?.id)} className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        Nome interno
        <input name="name" required defaultValue={campaign?.name} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        Assunto ({"{{nome}}"} vira o primeiro nome)
        <input name="subject" required defaultValue={campaign?.subject} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted md:col-span-2">
        Frase de prévia na caixa de entrada (opcional)
        <input name="preheader" defaultValue={campaign?.preheader} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted md:col-span-2">
        Texto (linha em branco separa parágrafos)
        <textarea name="body" required rows={8} defaultValue={campaign?.body} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        Texto do botão
        <input name="ctaLabel" defaultValue={campaign?.ctaLabel} placeholder="Ver carros" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        Link do botão (página do site)
        <input name="ctaUrl" defaultValue={campaign?.ctaUrl} placeholder="/carros" className={input} />
      </label>
      <fieldset className="flex flex-wrap gap-3 text-xs text-ink md:col-span-2">
        <legend className="mb-1 font-semibold text-ink-muted">Para quem (nenhum marcado = todos com permissão)</legend>
        {Object.entries(MARKETING_INTERESTS).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1">
            <input type="checkbox" name="interests" value={key} defaultChecked={campaign?.segment.interests.includes(key)} />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="md:col-span-2">
        <Button type="submit" className="py-2">
          {campaign ? "Salvar alterações" : "Criar campanha"}
        </Button>
      </div>
    </form>
  );
}

function Campaigns({ data }: { data: MarketingSummary }) {
  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs text-ink-muted">
        Só recebe quem deu permissão (marcou a caixa no cadastro ou no formulário de novidades, ou é cliente) e não se descadastrou. Todo e-mail sai com o motivo do
        envio e o link de descadastro. Respostas chegam no e-mail de resposta configurado.
      </p>
      <details key={`nova-campanha-${data.campaigns.length}`} className="rounded-brand-lg border border-border bg-surface-raised p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">+ Criar uma campanha você mesmo</summary>
        <div className="mt-4">
          <CampaignForm />
        </div>
      </details>
      {data.campaigns.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhuma campanha ainda.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.campaigns.map((campaign) => (
            <li key={campaign.id} className={`flex flex-col gap-3 rounded-brand-lg border bg-surface-raised p-4 text-sm ${campaign.status === "awaiting_approval" ? "border-2 border-brand-orange" : "border-border"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={EMAIL_CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status} tone={toneFor(campaign.status)} />
                <span className="font-semibold text-ink">{campaign.name}</span>
                <span className="text-xs text-ink-muted">
                  {campaign.segment.interests.length ? campaign.segment.interests.map(interestLabel).join(", ") : "Todos com permissão"} · {number(campaign.audienceSize)} contato(s)
                </span>
              </div>
              <div className="rounded-brand border border-border bg-surface-page p-4">
                <p className="text-xs text-ink-muted">Assunto</p>
                <p className="font-semibold text-ink">{campaign.subject}</p>
                {campaign.preheader && <p className="text-xs text-ink-muted">{campaign.preheader}</p>}
                <p className="mt-3 whitespace-pre-line text-ink">{campaign.body}</p>
                {campaign.ctaLabel && (
                  <p className="mt-3">
                    <span className="inline-block rounded-full bg-brand-green px-4 py-2 text-xs font-bold text-on-green">{campaign.ctaLabel}</span>
                    <span className="ml-2 text-xs text-ink-muted">{campaign.ctaUrl}</span>
                  </p>
                )}
              </div>
              {campaign.feedback && <p className="text-xs text-ink-muted">Seu último pedido: “{campaign.feedback}”</p>}
              {campaign.scheduledFor && campaign.status === "scheduled" && <p className="text-xs text-ink">Envio agendado para {dateTime(campaign.scheduledFor)}</p>}
              {["sending", "sent"].includes(campaign.status) && (
                <p className="text-xs text-ink [font-variant-numeric:tabular-nums]">
                  Na fila {campaign.stats.queued} · Enviados {campaign.stats.sent} · Entregues {campaign.stats.delivered} · Voltaram {campaign.stats.bounced} · Falharam{" "}
                  {campaign.stats.failed} · Clicaram {campaign.stats.clicked} ({campaign.stats.clicks} cliques) · Descadastraram {campaign.stats.unsubscribed}
                </p>
              )}
              <DecisionForm kind="campaigns" id={campaign.id} status={campaign.status} />
              {OPEN.includes(campaign.status) && (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-brand-blue">Editar você mesmo</summary>
                  <div className="mt-3">
                    <CampaignForm campaign={campaign} />
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------- Sequências ----------------

function Sequences({ data }: { data: MarketingSummary }) {
  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs text-ink-muted">
        Quando um contato novo entra (cadastro, formulário de novidades, loja nova, pedido de financiamento) com permissão, ele recebe a sequência do interesse dele.
        Ela para sozinha quando a pessoa se descadastra, o e-mail volta ou ela converte (publica anúncio, pede contato de um anúncio, vira loja). Os dias contam a
        partir do e-mail anterior.
      </p>
      {data.sequences.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhuma sequência ainda. O agente de Marketing propõe as sequências na rodada semanal.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.sequences.map((sequence: EmailSequenceView) => (
            <li key={sequence.id} className={`flex flex-col gap-3 rounded-brand-lg border bg-surface-raised p-4 text-sm ${sequence.status === "awaiting_approval" ? "border-2 border-brand-orange" : "border-border"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={EMAIL_SEQUENCE_STATUS_LABELS[sequence.status] ?? sequence.status} tone={toneFor(sequence.status)} />
                <span className="font-semibold text-ink">{sequence.name}</span>
                <span className="text-xs text-ink-muted">
                  {sequence.interests.length ? sequence.interests.map(interestLabel).join(", ") : "Todos os interesses"} · em andamento {sequence.enrolled.active} · concluíram{" "}
                  {sequence.enrolled.completed} · pararam {sequence.enrolled.stopped}
                </span>
              </div>
              <ol className="flex flex-col gap-2">
                {sequence.steps.map((step, index) => (
                  <li key={index} className="rounded-brand border border-border bg-surface-page p-3">
                    <p className="text-xs font-bold text-ink-muted">
                      E-mail {index + 1} · {step.delayDays === 0 ? (index === 0 ? "na hora" : "logo depois do anterior") : `${step.delayDays} dia(s) depois`}
                      {step.condition && step.condition !== "sempre" ? ` · ${EMAIL_STEP_CONDITIONS[step.condition]}` : ""}
                    </p>
                    <p className="font-semibold text-ink">{step.subject}</p>
                    <p className="mt-1 whitespace-pre-line text-ink">{step.body}</p>
                    {step.ctaLabel && <p className="mt-1 text-xs text-ink-muted">Botão: {step.ctaLabel} → {step.ctaUrl}</p>}
                  </li>
                ))}
              </ol>
              {sequence.feedback && <p className="text-xs text-ink-muted">Seu último pedido: “{sequence.feedback}”</p>}
              <DecisionForm kind="sequences" id={sequence.id} status={sequence.status === "paused" ? "awaiting_approval" : sequence.status} schedule={false} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------- Contatos ----------------

function Contacts({ data }: { data: MarketingSummary }) {
  const cards = [
    { label: "Contatos", value: data.contacts.total },
    { label: "Podem receber e-mail", value: data.contacts.reachable },
    { label: "Novos em 30 dias", value: data.contacts.new30d },
    { label: "Saíram da lista", value: data.contacts.unsubscribed },
  ];
  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs text-ink-muted">
        Contatos entram sozinhos, com a origem de cada um: cadastro no site, formulário de novidades (rodapé), cadastro de loja e pedido de financiamento. O mesmo
        e-mail ou telefone nunca vira dois contatos.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-brand-lg border border-border bg-surface-raised p-4">
            <p className="text-xs text-ink-muted">{card.label}</p>
            <p className="font-display text-2xl font-semibold text-ink [font-variant-numeric:tabular-nums]">{number(card.value)}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Breakdown title="Por origem" rows={data.contacts.bySource.map((row) => ({ label: sourceLabel(row.source), count: row.count }))} />
        <Breakdown title="Por interesse" rows={data.contacts.byInterest.map((row) => ({ label: interestLabel(row.interest), count: row.count }))} />
      </div>
      <div className="overflow-x-auto rounded-brand-lg border border-border">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-surface-sober text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-3 py-2">E-mail</th>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Interesse</th>
              <th className="px-3 py-2">Origem</th>
              <th className="px-3 py-2">Permissão</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2">Etapa</th>
              <th className="px-3 py-2">Entrou</th>
            </tr>
          </thead>
          <tbody>
            {data.contacts.latest.map((contact) => (
              <tr key={contact.id} className="border-t border-border">
                <td className="px-3 py-2 text-ink">{contact.email ?? "—"}</td>
                <td className="px-3 py-2 text-ink">{contact.name ?? "—"}</td>
                <td className="px-3 py-2 text-ink">{interestLabel(contact.interest)}</td>
                <td className="px-3 py-2 text-ink">{sourceLabel(contact.source)}</td>
                <td className="px-3 py-2 text-ink">{MARKETING_CONSENT_LABELS[contact.consent] ?? contact.consent}</td>
                <td className="px-3 py-2 text-ink">{CONTACT_STATUS[contact.status] ?? contact.status}</td>
                <td className="px-3 py-2 text-ink">{STAGE_LABELS[contact.stage] ?? contact.stage}</td>
                <td className="px-3 py-2 text-ink-muted">{dateTime(contact.createdAt)}</td>
              </tr>
            ))}
            {data.contacts.latest.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-ink-muted">
                  Nenhum contato ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="rounded-brand-lg border border-border bg-surface-raised p-4">
      <p className="mb-2 text-sm font-semibold text-ink">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-muted">Sem dados ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.label} className="text-xs">
              <div className="flex justify-between text-ink">
                <span>{row.label}</span>
                <span className="[font-variant-numeric:tabular-nums]">{number(row.count)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-surface-sober">
                <div className="h-2 rounded-full bg-brand-blue" style={{ width: `${(row.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------- Resultados ----------------

function Results({ data }: { data: MarketingSummary }) {
  const r = data.results;
  const groups = [
    {
      title: "Instagram (posts publicados por aqui, 30 dias)",
      items: [
        { label: "Posts publicados", value: r.postsPublished30d },
        { label: "Alcance", value: r.reach },
        { label: "Curtidas", value: r.likes },
        { label: "Comentários", value: r.comments },
        { label: "Salvos", value: r.saves },
      ],
    },
    {
      title: "E-mail (30 dias)",
      items: [
        { label: "Enviados", value: r.emailsSent30d },
        { label: "Entregues", value: r.delivered30d },
        { label: "Voltaram / spam", value: r.bounced30d },
        { label: "Clicaram", value: r.clicked30d },
        { label: "Descadastraram", value: r.unsubscribed30d },
      ],
    },
    {
      title: "Conversões",
      items: [
        { label: "Leads vindos de e-mail (30 dias)", value: r.leadsFromEmail30d },
        { label: "Cadastros vindos de e-mail (30 dias)", value: r.signupsFromEmail30d },
        { label: "Contatos que converteram", value: r.contactsConverted },
        { label: "Contatos novos (30 dias)", value: data.contacts.new30d },
      ],
    },
  ];
  return (
    <section className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.title}>
          <h2 className="mb-2 font-display text-lg font-semibold text-ink">{group.title}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {group.items.map((item) => (
              <div key={item.label} className="rounded-brand-lg border border-border bg-surface-raised p-4">
                <p className="text-xs text-ink-muted">{item.label}</p>
                <p className="font-display text-2xl font-semibold text-ink [font-variant-numeric:tabular-nums]">{number(item.value)}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-ink-muted">
        Entregas e devoluções dependem do webhook do Resend; aberturas não são contadas (os leitores de e-mail bloqueiam). Respostas chegam direto na caixa de
        e-mail de resposta. Visitas e posts feitos fora daqui continuam no Painel geral e em Operação com IA (Google Analytics e Instagram via Windsor).
      </p>
      <div className="flex flex-wrap gap-3">
        <form action={mktRefreshMetricsAction}>
          <Button type="submit" variant="ghost" className="py-2">
            Atualizar métricas do Instagram agora
          </Button>
        </form>
        <form action={opsRunAgentAction.bind(null, "marketing")}>
          <Button type="submit" variant="secondary" className="py-2">
            Pedir ao agente de Marketing para analisar e propor ações
          </Button>
        </form>
      </div>
    </section>
  );
}
