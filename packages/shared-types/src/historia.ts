// Diário do Carro: transforma a linha do tempo do Passaporte Digital em
// capítulos por dono, com selos que só aparecem quando há prova.
// Regra pura — a API e o site usam a mesma (testes em
// apps/api/src/vehicles/historia.spec.ts).

type Evento = {
  id: string;
  type: string;
  source: string;
  title: string;
  description?: string;
  mileageAtEvent?: number;
  occurredAt: string;
  photos: string[];
  verifiedByPartnerName?: string;
};
type Perfil = { ownersCount: number; events: Evento[]; anuncios?: { publicadoEm: string; cidade: string; uf: string }[] };

export type CapituloDoCarro<E extends Evento = Evento> = {
  numero: number;
  inicio?: string;
  fim?: string;
  atual: boolean;
  cidade?: string;
  kmInicio?: number;
  kmFim?: number;
  eventos: E[];
  // Carta do dono deste capítulo para o próximo dono (a mais recente).
  carta?: E;
};
export type SeloDoCarro = { id: "revisoes_comprovadas" | "oficina_verificada" | "km_coerente" | "mesmo_dono"; nome: string; descricao: string };
export type HistoriaDoCarro<E extends Evento = Evento> = {
  capitulos: CapituloDoCarro<E>[];
  selos: SeloDoCarro[];
  alertas: string[];
  kmAtual?: number;
  subtitulo: string;
};

export const formatarKm = (km: number) => `${String(Math.round(km)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} km`;
const mesAno = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};
const meses = (de: string, ate: Date) => {
  const a = new Date(de);
  let m = (ate.getUTCFullYear() - a.getUTCFullYear()) * 12 + (ate.getUTCMonth() - a.getUTCMonth());
  if (ate.getUTCDate() < a.getUTCDate()) m -= 1;
  return m;
};

export function historiaDoCarro<E extends Evento>(perfil: Perfil & { events: E[] }, agora: Date = new Date()): HistoriaDoCarro<E> {
  const eventos = [...perfil.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  // Capítulos: cada troca de dono abre um novo, começando por ela.
  const grupos: E[][] = [[]];
  for (const e of eventos) {
    if (e.type === "ownership_change" && grupos[grupos.length - 1]!.length) grupos.push([]);
    grupos[grupos.length - 1]!.push(e);
  }
  const anuncios = [...(perfil.anuncios ?? [])].sort((a, b) => a.publicadoEm.localeCompare(b.publicadoEm));
  const capitulos: CapituloDoCarro<E>[] = grupos.map((evs, i) => {
    const inicio = evs[0]?.occurredAt;
    const fim = grupos[i + 1]?.[0]?.occurredAt;
    const kms = evs.map((e) => e.mileageAtEvent).filter((k): k is number => typeof k === "number");
    const anuncio = anuncios.find((a) => (!inicio || a.publicadoEm >= inicio) && (!fim || a.publicadoEm < fim));
    return {
      numero: i + 1,
      inicio,
      fim,
      atual: i === grupos.length - 1,
      cidade: anuncio ? `${anuncio.cidade}/${anuncio.uf}` : undefined,
      kmInicio: kms[0],
      kmFim: kms.length ? kms[kms.length - 1] : undefined,
      eventos: evs.filter((e) => e.type !== "letter"),
      carta: evs.filter((e) => e.type === "letter").pop(),
    };
  });

  // Quilometragem: a leitura mais recente e se ela anda sempre para frente.
  const leituras = eventos.filter((e) => typeof e.mileageAtEvent === "number");
  const alertas: string[] = [];
  for (let i = 1; i < leituras.length; i++) {
    const antes = leituras[i - 1]!;
    const depois = leituras[i]!;
    if (depois.mileageAtEvent! < antes.mileageAtEvent!) {
      alertas.push(`Quilometragem caiu de ${formatarKm(antes.mileageAtEvent!)} (${mesAno(antes.occurredAt)}) para ${formatarKm(depois.mileageAtEvent!)} (${mesAno(depois.occurredAt)}). Confira com o vendedor.`);
    }
  }
  const kmAtual = leituras.length ? leituras[leituras.length - 1]!.mileageAtEvent : undefined;

  const selos: SeloDoCarro[] = [];
  const revisoes = eventos.filter((e) => e.type === "revision" && e.photos.length > 0);
  if (revisoes.length) selos.push({ id: "revisoes_comprovadas", nome: "Revisões comprovadas", descricao: `${revisoes.length} ${revisoes.length === 1 ? "revisão registrada" : "revisões registradas"} com comprovante` });
  const oficinas = eventos.filter((e) => e.source === "partner_verified");
  if (oficinas.length) selos.push({ id: "oficina_verificada", nome: "Oficina verificada", descricao: `${oficinas.length} ${oficinas.length === 1 ? "serviço confirmado" : "serviços confirmados"} por oficina parceira` });
  if (leituras.length >= 2 && !alertas.length) selos.push({ id: "km_coerente", nome: "Km coerente", descricao: "A quilometragem registrada sempre andou para frente" });
  const inicioAtual = capitulos[capitulos.length - 1]!.inicio;
  const mesesDono = inicioAtual ? meses(inicioAtual, agora) : 0;
  if (mesesDono >= 12) {
    const anos = Math.floor(mesesDono / 12);
    selos.push({ id: "mesmo_dono", nome: `Mesmo dono há ${anos} ${anos === 1 ? "ano" : "anos"}`, descricao: `Sem troca de dono registrada desde ${mesAno(inicioAtual!)}` });
  }

  const donos = `${perfil.ownersCount} ${perfil.ownersCount === 1 ? "dono" : "donos"}`;
  return { capitulos, selos, alertas, kmAtual, subtitulo: kmAtual !== undefined ? `${donos} · ${formatarKm(kmAtual)}` : donos };
}

// Fatos do carro para o resumo da IA: só dados estruturados (contagens,
// datas, selos). Nada do texto livre do dono vai para a IA.
export function fatosDoCarro(
  perfil: Perfil & { brand?: string; model?: string; yearModel?: number },
  historia: HistoriaDoCarro,
): string[] {
  const fatos: string[] = [];
  const nome = [perfil.brand, perfil.model, perfil.yearModel].filter(Boolean).join(" ");
  if (nome) fatos.push(`Carro: ${nome}`);
  fatos.push(`${perfil.ownersCount} ${perfil.ownersCount === 1 ? "dono registrado" : "donos registrados"} no NovoSeminovo`);
  for (const c of historia.capitulos) {
    const periodo = c.inicio ? `de ${mesAno(c.inicio)} a ${c.fim ? mesAno(c.fim) : "hoje"}` : "sem data";
    fatos.push(`${c.numero}º dono: ${periodo}${c.cidade ? `, ${c.cidade}` : ""}${c.atual ? " (dono atual)" : ""}`);
  }
  const evs = perfil.events;
  const conta = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const revisoes = evs.filter((e) => e.type === "revision" && e.photos.length > 0).length;
  if (revisoes) fatos.push(conta(revisoes, "revisão com comprovante", "revisões com comprovante"));
  const reparos = evs.filter((e) => e.type === "repair").length;
  if (reparos) fatos.push(conta(reparos, "reparo registrado", "reparos registrados"));
  const oficina = evs.filter((e) => e.source === "partner_verified").length;
  if (oficina) fatos.push(conta(oficina, "serviço confirmado por oficina parceira", "serviços confirmados por oficina parceira"));
  const vistorias = evs.filter((e) => e.type === "inspection").length;
  if (vistorias) fatos.push(conta(vistorias, "vistoria registrada", "vistorias registradas"));
  const sinistros = evs.filter((e) => e.type === "accident").length;
  if (sinistros) fatos.push(conta(sinistros, "batida registrada", "batidas registradas"));
  const momentos = evs.filter((e) => e.type === "moment").length;
  if (momentos) fatos.push(conta(momentos, "momento registrado pelo dono", "momentos registrados pelo dono"));
  const cartas = historia.capitulos.filter((c) => c.carta).length;
  if (cartas) fatos.push(conta(cartas, "carta para o próximo dono", "cartas para o próximo dono"));
  // Quilometragem fica de fora do resumo de propósito (decisão do Diego:
  // não destacar km); só o selo "Km coerente" e alertas entram.
  for (const s of historia.selos) fatos.push(`Selo: ${s.nome} (${s.descricao})`);
  for (const a of historia.alertas) fatos.push(`Atenção: ${a}`);
  return fatos;
}
