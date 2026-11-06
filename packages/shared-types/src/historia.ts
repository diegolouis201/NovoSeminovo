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
      eventos: evs,
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
