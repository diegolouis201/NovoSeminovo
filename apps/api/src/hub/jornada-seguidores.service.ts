import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { JORNADA_REDES, JORNADA_REDES_LISTA, type JornadaRede, type JornadaRedeAtual } from "@novoseminovo/shared-types";
import { fetchPageAccessToken, fetchPageFollowers, metaLeadsConfig } from "../meta/meta-leads";
import { trackRoutine } from "../operations/routine-health";
import { windsorEnabled, windsorRows } from "../operations/windsor";
import { PrismaService } from "../prisma/prisma.service";
import { escolherSeguidores, estadoDoBanco, registrarLeitura, resumoRede, type SeguidoresEstado } from "./jornada-seguidores";

const CACHE_MS = 60 * 60 * 1000;
const ROTINA_MS = 6 * 60 * 60 * 1000;
const CHAVE_ATUAL = "jornada_seguidores";
const CHAVE_HISTORICO = "jornada_seguidores_historico";

// Conectores do Windsor.ai e os campos de total que podem trazer o número.
// O Instagram foi conferido na conta (tabela user_info, "followers_count" =
// total de hoje). Os outros três ainda não estão conectados lá, então o nome
// do campo não pôde ser conferido: tenta os candidatos de total (nunca os de
// "ganhos no dia") e a rede só aparece quando um deles devolve um número.
const WINDSOR: Record<Exclude<JornadaRede, "facebook">, { conector: string; campos: string[] }> = {
  instagram: { conector: "instagram", campos: ["followers_count"] },
  tiktok: { conector: "tiktok_organic", campos: ["followers_count", "follower_count", "total_followers_count"] },
  youtube: { conector: "youtube", campos: ["subscriber_count", "subscribers_count", "channel_subscriber_count"] },
  linkedin: { conector: "linkedin_organic", campos: ["followers_count", "follower_count", "organization_follower_count", "total_follower_count"] },
};

type Leituras = Partial<Record<JornadaRede, number>>;

// Seguidores de cada rede para a Jornada: lidos no servidor (Windsor.ai e
// Graph API da Meta), guardados 1h em memória e no banco (último valor bom +
// um ponto por dia). Fonte fora do ar: fica o último valor com a data.
@Injectable()
export class SeguidoresService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeguidoresService.name);
  private cache?: { ate: number; redes: Record<JornadaRede, JornadaRedeAtual> };
  private emAndamento?: Promise<Record<JornadaRede, JornadaRedeAtual>>;
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

  private async lerEGuardar(): Promise<Record<JornadaRede, JornadaRedeAtual>> {
    const [leituras, salvo] = await Promise.all([this.lerFontes(), this.estadoSalvo()]);
    const agora = new Date();
    let estado = salvo;
    for (const rede of JORNADA_REDES_LISTA) {
      const valor = leituras[rede];
      if (valor !== undefined) estado = registrarLeitura(estado, rede, valor, agora);
    }
    if (Object.keys(leituras).length) await this.guardar(estado);
    const redes = {} as Record<JornadaRede, JornadaRedeAtual>;
    for (const rede of JORNADA_REDES_LISTA) redes[rede] = resumoRede(estado, rede, agora, leituras[rede] !== undefined);
    this.cache = { ate: Date.now() + CACHE_MS, redes };
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

  private async lerFontes(): Promise<Leituras> {
    const out: Leituras = {};
    const tarefas: Promise<void>[] = [];
    const ler = (rede: JornadaRede, fn: () => Promise<number | null>) =>
      tarefas.push(
        fn().then(
          (v) => {
            if (v !== null) out[rede] = v;
          },
          (erro: unknown) => this.avisar(rede, erro),
        ),
      );
    if (windsorEnabled()) {
      for (const [rede, fonte] of Object.entries(WINDSOR) as Array<[Exclude<JornadaRede, "facebook">, (typeof WINDSOR)["instagram"]]>) {
        ler(rede, () => this.lerWindsor(rede, fonte.conector, fonte.campos));
      }
    }
    ler("facebook", () => this.lerFacebook());
    await Promise.all(tarefas);
    return out;
  }

  // Instagram: falha vira aviso (é a rede conectada). Os outros: conector
  // não conectado ou campo desconhecido = sem número, sem barulho no log.
  private async lerWindsor(rede: JornadaRede, conector: string, campos: string[]): Promise<number | null> {
    let ultimoErro: unknown;
    for (const campo of campos) {
      try {
        const fields = rede === "instagram" ? ["username", campo] : ["date", campo];
        const valor = escolherSeguidores(await windsorRows(conector, fields, "last_7dT"), campo);
        if (valor !== null) return valor;
      } catch (erro) {
        ultimoErro = erro;
      }
    }
    if (rede === "instagram" && ultimoErro) throw ultimoErro;
    return null;
  }

  private async lerFacebook(): Promise<number | null> {
    const config = metaLeadsConfig();
    if (!config.pageToken || !config.pageId) return null;
    // Mesmo caminho do Lead Ads: o arquivo costuma ter o token do usuário do
    // sistema; a Graph troca pelo token da página (ou usa o salvo).
    const base = { ...config, pageToken: config.pageToken };
    const pageToken = (await fetchPageAccessToken(base, config.pageId)) ?? config.pageToken;
    return (await fetchPageFollowers({ ...config, pageToken }, config.pageId)) ?? null;
  }

  // Aviso sem segredo: tira chave do Windsor e tokens da Meta da mensagem.
  private avisar(rede: JornadaRede, erro: unknown): void {
    let msg = erro instanceof Error ? erro.message : String(erro);
    for (const segredo of [process.env.WINDSOR_API_KEY, metaLeadsConfig().pageToken]) if (segredo) msg = msg.split(segredo).join("***");
    this.logger.warn(`Jornada: seguidores do ${JORNADA_REDES[rede]} indisponíveis agora (fica o último valor guardado): ${msg.slice(0, 300)}`);
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
