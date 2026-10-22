import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PARTNER_TYPE_LABELS, type CnpjLookup, type PartnerType } from "@novoseminovo/shared-types";

// Consulta de CNPJ na base pública da Receita (BrasilAPI; se ela falhar,
// publica.cnpj.ws) e o tipo de conta pelo ramo de atividade (CNAE).
// CNPJ_API_URL troca a BrasilAPI por outro endereço no mesmo formato (testes).

const BRASILAPI_URL = process.env.CNPJ_API_URL ?? "https://brasilapi.com.br/api/cnpj/v1";
const CNPJWS_URL = "https://publica.cnpj.ws/cnpj";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

type RawCompany = {
  legalName: string;
  tradeName?: string;
  situation: string;
  mainCnae?: string;
  mainActivity?: string;
  secondaryCnaes: string[];
  // Empresário individual (natureza 213-5) ou MEI: corretor autônomo.
  individual: boolean;
  city?: string;
  state?: string;
  address?: string;
};

// Prefixos de CNAE (subclasse, só números) → tipo de conta.
const CNAE_RULES: { prefix: string; type: PartnerType; label?: string }[] = [
  { prefix: "4511101", type: "dealership", label: "Concessionária" },
  { prefix: "4541203", type: "dealership", label: "Concessionária de motos" },
  { prefix: "4511", type: "dealership" },
  { prefix: "4512", type: "dealership" },
  { prefix: "4541", type: "dealership" },
  { prefix: "4520", type: "workshop" },
  { prefix: "4110", type: "builder" },
  { prefix: "4120", type: "builder" },
  { prefix: "6821", type: "real_estate_agency" },
  { prefix: "6822", type: "real_estate_agency" },
  { prefix: "6810", type: "real_estate_agency" },
];

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function clean(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

// Atividade principal decide sozinha; se só uma secundária bate (ex.: fábrica
// de esquadrias que também tem "compra e venda de imóveis próprios"), vira
// sugestão que a pessoa confirma na tela (fromSecondary).
export function classifyCompany(
  company: Pick<RawCompany, "mainCnae" | "secondaryCnaes" | "individual">,
): { type: PartnerType; label: string; fromSecondary: boolean } | undefined {
  for (const cnae of [company.mainCnae, ...company.secondaryCnaes]) {
    if (!cnae) continue;
    const rule = CNAE_RULES.find((candidate) => cnae.startsWith(candidate.prefix));
    if (!rule) continue;
    // Corretagem em nome próprio (MEI/empresário individual) é corretor(a).
    const type = rule.type === "real_estate_agency" && company.individual && cnae.startsWith("6821") ? "broker" : rule.type;
    return { type, label: rule.label ?? PARTNER_TYPE_LABELS[type] ?? type, fromSecondary: cnae !== company.mainCnae };
  }
  return undefined;
}

@Injectable()
export class CnpjService {
  private readonly logger = new Logger(CnpjService.name);
  private readonly cache = new Map<string, { at: number; value: CnpjLookup }>();

  async lookup(rawCnpj: string): Promise<CnpjLookup> {
    const cnpj = onlyDigits(rawCnpj);
    const cached = this.cache.get(cnpj);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

    let company: RawCompany | undefined;
    let notFound = false;
    for (const provider of [() => this.fromBrasilApi(cnpj), () => this.fromCnpjWs(cnpj)]) {
      try {
        company = await provider();
        if (company) break;
        notFound = true;
      } catch (error) {
        this.logger.warn(`Consulta de CNPJ falhou: ${(error as Error).message}`);
      }
    }
    if (!company) {
      if (notFound) throw new NotFoundException("CNPJ não encontrado na Receita Federal. Confira os números.");
      throw new ServiceUnavailableException("Não conseguimos consultar o CNPJ agora. Tente de novo em alguns minutos.");
    }

    const detected = classifyCompany(company);
    const value: CnpjLookup = {
      cnpj,
      legalName: company.legalName,
      tradeName: company.tradeName,
      active: /^ativa$/i.test(company.situation),
      situation: company.situation,
      activity: company.mainActivity,
      detectedType: detected?.type,
      detectedLabel: detected?.label,
      detectedFromSecondary: detected?.fromSecondary || undefined,
      city: company.city,
      state: company.state,
      address: company.address,
    };
    this.cache.set(cnpj, { at: Date.now(), value });
    return value;
  }

  // undefined = CNPJ não existe; exceção = serviço fora do ar.
  private async fromBrasilApi(cnpj: string): Promise<RawCompany | undefined> {
    const res = await fetch(`${BRASILAPI_URL}/${cnpj}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 404 || res.status === 400) return undefined;
    if (!res.ok) throw new Error(`BrasilAPI respondeu ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    const secondary = Array.isArray(data.cnaes_secundarios) ? (data.cnaes_secundarios as { codigo?: unknown }[]) : [];
    const street = [clean(data.descricao_tipo_de_logradouro), clean(data.logradouro)].filter(Boolean).join(" ");
    return {
      legalName: clean(data.razao_social) ?? "",
      tradeName: clean(data.nome_fantasia),
      situation: clean(data.descricao_situacao_cadastral) ?? "",
      mainCnae: onlyDigits(data.cnae_fiscal).padStart(7, "0"),
      mainActivity: clean(data.cnae_fiscal_descricao),
      secondaryCnaes: secondary.map((item) => onlyDigits(item.codigo).padStart(7, "0")).filter((code) => code !== "0000000"),
      individual: onlyDigits(data.codigo_natureza_juridica) === "2135" || data.opcao_pelo_mei === true,
      city: clean(data.municipio),
      state: clean(data.uf),
      address: [street, clean(data.numero), clean(data.bairro)].filter(Boolean).join(", ") || undefined,
    };
  }

  private async fromCnpjWs(cnpj: string): Promise<RawCompany | undefined> {
    const res = await fetch(`${CNPJWS_URL}/${cnpj}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 404 || res.status === 400) return undefined;
    if (!res.ok) throw new Error(`cnpj.ws respondeu ${res.status}`);
    const data = (await res.json()) as {
      razao_social?: string;
      natureza_juridica?: { id?: string };
      simples?: { mei?: string };
      estabelecimento?: {
        nome_fantasia?: string;
        situacao_cadastral?: string;
        atividade_principal?: { subclasse?: string; descricao?: string };
        atividades_secundarias?: { subclasse?: string }[];
        tipo_logradouro?: string;
        logradouro?: string;
        numero?: string;
        bairro?: string;
        cidade?: { nome?: string };
        estado?: { sigla?: string };
      };
    };
    const place = data.estabelecimento ?? {};
    const street = [clean(place.tipo_logradouro), clean(place.logradouro)].filter(Boolean).join(" ");
    return {
      legalName: clean(data.razao_social) ?? "",
      tradeName: clean(place.nome_fantasia),
      situation: clean(place.situacao_cadastral) ?? "",
      mainCnae: onlyDigits(place.atividade_principal?.subclasse),
      mainActivity: clean(place.atividade_principal?.descricao),
      secondaryCnaes: (place.atividades_secundarias ?? []).map((item) => onlyDigits(item.subclasse)).filter(Boolean),
      individual: onlyDigits(data.natureza_juridica?.id) === "2135" || /^sim$/i.test(data.simples?.mei ?? ""),
      city: clean(place.cidade?.nome),
      state: clean(place.estado?.sigla),
      address: [street, clean(place.numero), clean(place.bairro)].filter(Boolean).join(", ") || undefined,
    };
  }
}
