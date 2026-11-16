import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { JORNADA_REDES, JORNADA_REDES_LISTA, type JornadaRede, type JornadaRedeAtual } from "@novoseminovo/shared-types";
import { fetchInstagramFollowers, fetchPageAccessToken, fetchPageFollowers, metaLeadsConfig } from "../meta/meta-leads";
import { trackRoutine } from "../operations/routine-health";
import { windsorEnabled, windsorRows } from "../operations/windsor";
import { PrismaService } from "../prisma/prisma.service";
import { escolherSeguidores, estadoDoBanco, registrarLeitura, resumoRede, type SeguidoresEstado } from "./jornada-seguidores";
import { fetchYoutubeSubscribers, youtubeConfig } from "./youtube";

const CACHE_MS = 60 * 60 * 1000;
const ROTINA_MS = 6 * 60 * 60 * 1000;
const CHAVE_ATUAL = "jornada_seguidores";
const CHAVE_HISTORICO = "jornada_seguidores_historico";

// Aviso no painel quando a Graph recusa o Instagram (sem segredo).
export const AVISO_INSTAGRAM =
  "A Meta recusou a leitura do Instagram: provavelmente falta a permissão instagram_basic (e instagram_manage_insights / pages_read_engagement) no token do usuário do sistema. Veja DEPLOY.md, \"Seguidores da Jornada\".";

type Leitura = { leituras: Partial<Record<JornadaRede, number>>; automaticas: Set<JornadaRede>; avisos: Partial<Record<JornadaRede, string>> };

// Seguidores de cada rede para a Jornada. Fontes automáticas, lidas no
// servidor:
//   - Facebook: Graph da Meta (página);
//   - Instagram: Graph da Meta (conta ligada à página); se a Graph recusar
//     ou a página não tiver Instagram ligado, Windsor.ai (quando configurado);
//   - YouTube: YouTube Data API (chave em secrets/youtube_api_key + canal em
//     YOUTUBE_CHANNEL);
//   - TikTok e LinkedIn: sem fonte automática.
// Qualquer rede aceita o número digitado pelo dono (registrarManual). A
// leitura automática que devolve número passa por cima; sem ela, fica o
// último valor guardado (digitado ou não) com a data. Cache de 1h em
// memória; banco guarda o último valor + um ponto por dia.
@Injectable()
export class SeguidoresService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeguidoresService.name);
  private cache?: { ate: number; redes: Record<JornadaRede, JornadaRedeAtual>; ultima: Leitura };
  private emAndamento?: Promise<Record<JornadaRede, JornadaRedeAtual>>;
  private gravando: Promise<unknown> = Promise.resolve();
  private timer?: NodeJS.Timeout;
  private primeira?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async redes(): Promise<Record<JornadaRede, JornadaRedeAtual>> {
    if (this.cache && this.cache.ate > Date.now()) return this.cache.redes;
    return this.atualizar();
  }

  // Uma leitura de cada vez (a tela e a rotina podem pedir juntas).
  atualizar(): Promise<Record<JornadaRede, JornadaRedeAtual>> {
    this.emAndamento ??= this.lerEGuardar().finally(() => {
      this.emAndamento = undefined;
    });
    return this.emAndamento;
  }

  // Número digitado pelo dono (rede e valor já validados pelo zod na rota).
  // Vira o valor atual (origem "manual", com data) e o ponto do dia. A tela
  // mostra na hora, sem reler as fontes; a próxima leitura automática que
  // funcionar passa por cima.
  async registrarManual(rede: JornadaRede, valor: number): Promise<JornadaRedeAtual> {
    const tarefa = this.gravando.then(async () => {
      await this.emAndamento?.catch(() => undefined);
      const agora = new Date();
      const estado = registrarLeitura(await this.estadoSalvo(), rede, valor, agora, "manual");
      await this.guardar(estado);
      const resumo = resumoRede(estado, rede, agora, false, { fonteAutomatica: this.fontesConfiguradas().has(rede), aviso: this.cache?.ultima.avisos[rede] });
      if (this.cache) this.cache.redes = { ...this.cache.redes, [rede]: resumo };
      return resumo;
    });
    this.gravando = tarefa.catch(() => undefined);
    return tarefa;
  }

  private async lerEGuardar(): Promise<Record<JornadaRede, JornadaRedeAtual>> {
    await this.gravando;
    const [leitura, salvo] = await Promise.all([this.lerFontes(), this.estadoSalvo()]);
    const { leituras } = leitura;
    const agora = new Date();
    let estado = salvo;
    for (const rede of JORNADA_REDES_LISTA) {
      const valor = leituras[rede];
      if (valor !== undefined) estado = registrarLeitura(estado, rede, valor, agora);
    }
    if (Object.keys(leituras).length) await this.guardar(estado);
    const redes = {} as Record<JornadaRede, JornadaRedeAtual>;
    for (const rede of JORNADA_REDES_LISTA) {
      redes[rede] = resumoRede(estado, rede, agora, leituras[rede] !== undefined, { fonteAutomatica: leitura.automaticas.has(rede), aviso: leitura.avisos[rede] });
    }
    this.cache = { ate: Date.now() + CACHE_MS, redes, ultima: leitura };
    return redes;
  }

  private async estadoSalvo(): Promise<SeguidoresEstado> {
    const rows = await this.prisma.mktSetting.findMany({ where: { chave: { in: [CHAVE_ATUAL, CHAVE_HISTORICO] } } });
    const valor = (chave: string) => rows.find((r) => r.chave === chave)?.valor;
    return estadoDoBanco(valor(CHAVE_ATUAL), valor(CHAVE_HISTORICO));
  }

  private async guardar(estado: SeguidoresEstado): Promise<void> {
    const salvar = (chave: string, valor: object) => this.prisma.mktSetting.upsert({ where: { chave }, create: { chave, valor }, update: { valor } });
    await Promise.all([salvar(CHAVE_ATUAL, estado.atual), salvar(CHAVE_HISTORICO, estado.historico)]);
  }

  // Redes com leitura automática configurada (para a tela dizer onde o dono
  // precisa digitar).
  private fontesConfiguradas(): Set<JornadaRede> {
    const meta = metaLeadsConfig();
    const out = new Set<JornadaRede>();
    if (meta.pageToken && meta.pageId) out.add("facebook").add("instagram");
    if (windsorEnabled()) out.add("instagram");
    if (youtubeConfig()) out.add("youtube");
    return out;
  }

  private async lerFontes(): Promise<Leitura> {
    const leitura: Leitura = { leituras: {}, automaticas: this.fontesConfiguradas(), avisos: {} };
    const ler = (rede: JornadaRede, fn: () => Promise<number | null>) =>
      fn().then(
        (v) => {
          if (v !== null) leitura.leituras[rede] = v;
        },
        (erro: unknown) => this.avisar(rede, erro),
      );
    const tokenPagina = this.tokenDaPagina();
    await Promise.all([
      ler("facebook", () => this.lerFacebook(tokenPagina)),
      ler("instagram", () => this.lerInstagram(tokenPagina, leitura)),
      ler("youtube", () => this.lerYoutube()),
    ]);
    return leitura;
  }

  // Mesmo caminho do Lead Ads: o arquivo costuma ter o token do usuário do
  // sistema; a Graph troca pelo token da página (ou usa o salvo).
  private async tokenDaPagina(): Promise<{ config: ReturnType<typeof metaLeadsConfig> & { pageToken: string }; pageId: string } | null> {
    const config = metaLeadsConfig();
    if (!config.pageToken || !config.pageId) return null;
    const pageToken = (await fetchPageAccessToken({ ...config, pageToken: config.pageToken }, config.pageId).catch(() => undefined)) ?? config.pageToken;
    return { config: { ...config, pageToken }, pageId: config.pageId };
  }

  private async lerFacebook(tokenPagina: ReturnType<SeguidoresService["tokenDaPagina"]>): Promise<number | null> {
    const t = await tokenPagina;
    if (!t) return null;
    return (await fetchPageFollowers(t.config, t.pageId)) ?? null;
  }

  // Graph primeiro; recusa (ex.: falta instagram_basic) vira aviso com o nome
  // da permissão e cai para o Windsor. Sem nenhuma das duas: null/erro e a
  // tela fica com o último valor guardado.
  private async lerInstagram(tokenPagina: ReturnType<SeguidoresService["tokenDaPagina"]>, leitura: Leitura): Promise<number | null> {
    const t = await tokenPagina;
    if (t) {
      try {
        const v = await fetchInstagramFollowers(t.config, t.pageId);
        if (v !== undefined) return v;
      } catch (erro) {
        const msg = this.semSegredo(erro);
        if (/HTTP 4\d\d/.test(msg)) {
          leitura.avisos.instagram = AVISO_INSTAGRAM;
          this.logger.warn(`Jornada: a Graph da Meta recusou os seguidores do Instagram (${msg.slice(0, 120)}) — provável falta da permissão instagram_basic (e instagram_manage_insights / pages_read_engagement) no token do usuário do sistema. Tentando o Windsor.`);
        } else {
          this.logger.warn(`Jornada: Graph da Meta fora do ar para o Instagram (${msg.slice(0, 120)}). Tentando o Windsor.`);
        }
      }
    }
    if (!windsorEnabled()) return null;
    return escolherSeguidores(await windsorRows("instagram", ["username", "followers_count"], "last_7dT"), "followers_count");
  }

  private async lerYoutube(): Promise<number | null> {
    const config = youtubeConfig();
    return config ? fetchYoutubeSubscribers(config) : null;
  }

  private semSegredo(erro: unknown): string {
    let msg = erro instanceof Error ? erro.message : String(erro);
    let yt: string | undefined;
    try {
      yt = youtubeConfig()?.chave;
    } catch {
      yt = undefined;
    }
    for (const segredo of [process.env.WINDSOR_API_KEY, metaLeadsConfig().pageToken, yt]) if (segredo) msg = msg.split(segredo).join("***");
    return msg;
  }

  // Aviso sem segredo: tira chaves e tokens da mensagem.
  private avisar(rede: JornadaRede, erro: unknown): void {
    this.logger.warn(`Jornada: seguidores do ${JORNADA_REDES[rede]} indisponíveis agora (fica o último valor guardado): ${this.semSegredo(erro).slice(0, 300)}`);
  }

  // A cada 6 horas, mesmo sem ninguém abrir a tela, para o histórico diário
  // não ficar com buracos. Desligada em teste ou com JORNADA_SEGUIDORES_SYNC_DISABLED=1.
  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || process.env.JORNADA_SEGUIDORES_SYNC_DISABLED === "1") return;
    const rodar = () => void trackRoutine("jornada-seguidores", ROTINA_MS, () => this.atualizar());
    this.primeira = setTimeout(rodar, 3 * 60_000);
    this.primeira.unref();
    this.timer = setInterval(rodar, ROTINA_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.primeira) clearTimeout(this.primeira);
    if (this.timer) clearInterval(this.timer);
  }
}
