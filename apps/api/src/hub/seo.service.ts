import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { SEO_OPORTUNIDADE, type HubSeo, type SeoDias } from "@novoseminovo/shared-types";
import { consultarGsc, filtrarGuias, gscConfig, linhasSeo, oportunidadesSeo, periodosSeo, totaisSeo, variacaoSeo, type GscConfig, type GscCorpo } from "./search-console";

const CACHE_MS = 6 * 60 * 60 * 1000;
const ATUALIZAR_MS = 5 * 60 * 1000;

const vazio = (dias: SeoDias): HubSeo => ({ configurado: false, dias, serie: [], consultas: [], paginas: [], oportunidades: [], guias: [], regraOportunidade: { ...SEO_OPORTUNIDADE } });

// SEO no Hub: números do Google Search Console por período (7, 28 ou 90
// dias), comparados com o período anterior. Cache de 6 horas por período; o
// dono pode forçar a leitura ("Atualizar"), no máximo uma vez a cada 5 min.
// Sem configuração: a tela explica o que falta (não é erro).
@Injectable()
export class SeoService {
  private readonly logger = new Logger(SeoService.name);
  private readonly cache = new Map<SeoDias, { ate: number; dados: HubSeo }>();
  private readonly emAndamento = new Map<SeoDias, Promise<HubSeo>>();
  private ultimaForcada = 0;
  // Relógio (os testes fixam o dia).
  agora: () => Date = () => new Date();

  async ler(dias: SeoDias): Promise<HubSeo> {
    const hit = this.cache.get(dias);
    if (hit && hit.ate > Date.now()) return hit.dados;
    return this.buscar(dias);
  }

  async atualizar(dias: SeoDias): Promise<HubSeo> {
    const espera = this.ultimaForcada + ATUALIZAR_MS - Date.now();
    if (espera > 0) {
      const min = Math.ceil(espera / 60_000);
      throw new HttpException(`Os dados foram atualizados há pouco. Tente de novo em ${min} ${min === 1 ? "minuto" : "minutos"}.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    this.ultimaForcada = Date.now();
    return this.buscar(dias);
  }

  private buscar(dias: SeoDias): Promise<HubSeo> {
    let p = this.emAndamento.get(dias);
    if (!p) {
      p = this.lerGoogle(dias).finally(() => this.emAndamento.delete(dias));
      this.emAndamento.set(dias, p);
    }
    return p;
  }

  private async lerGoogle(dias: SeoDias): Promise<HubSeo> {
    const cfg = gscConfig();
    if (!cfg.ok) return { ...vazio(dias), falta: cfg.falta };
    const { periodo, anterior } = periodosSeo(dias, this.agora());
    const base = { ...vazio(dias), configurado: true, site: cfg.config.site, periodo, anterior };
    try {
      const dados = await this.consultar(cfg.config, dias, periodo, anterior);
      const pronto: HubSeo = { ...base, ...dados, atualizadoEm: new Date().toISOString() };
      this.cache.set(dias, { ate: Date.now() + CACHE_MS, dados: pronto });
      return pronto;
    } catch (erro) {
      const msg = (erro as Error).message;
      this.logger.warn(`SEO (${dias} dias): ${msg}`);
      const velho = this.cache.get(dias)?.dados;
      return velho ? { ...velho, erro: msg } : { ...base, erro: msg };
    }
  }

  private async consultar(config: GscConfig, dias: SeoDias, periodo: { inicio: string; fim: string }, anterior: { inicio: string; fim: string }) {
    const corpo = (p: { inicio: string; fim: string }, extra: Partial<GscCorpo>): GscCorpo => ({ startDate: p.inicio, endDate: p.fim, type: "web", rowLimit: 1, ...extra });
    const [totAtual, totAnterior, serie, consultas, paginas, consultaPagina, guias] = await Promise.all([
      consultarGsc(config, corpo(periodo, {})),
      consultarGsc(config, corpo(anterior, {})),
      consultarGsc(config, corpo(periodo, { dimensions: ["date"], rowLimit: dias })),
      consultarGsc(config, corpo(periodo, { dimensions: ["query"], rowLimit: 50 })),
      consultarGsc(config, corpo(periodo, { dimensions: ["page"], rowLimit: 50 })),
      consultarGsc(config, corpo(periodo, { dimensions: ["query", "page"], rowLimit: 1000 })),
      consultarGsc(config, corpo(periodo, { dimensions: ["page"], rowLimit: 50, dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: "/guia/" }] }] })),
    ]);
    const a = totaisSeo(totAtual);
    const b = totaisSeo(totAnterior);
    return {
      totais: { cliques: variacaoSeo(a.cliques, b.cliques), impressoes: variacaoSeo(a.impressoes, b.impressoes), ctr: variacaoSeo(a.ctr, b.ctr), posicao: variacaoSeo(a.posicao, b.posicao) },
      serie: linhasSeo(serie)
        .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.chave))
        .map(({ chave, ...m }) => ({ dia: chave, ...m }))
        .sort((x, y) => x.dia.localeCompare(y.dia)),
      consultas: linhasSeo(consultas),
      paginas: linhasSeo(paginas),
      oportunidades: oportunidadesSeo(consultaPagina),
      guias: filtrarGuias(linhasSeo(guias)),
    };
  }
}
