import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// Coordenada dos imóveis pro mapa da busca, pelo Nominatim (OpenStreetMap,
// grátis, sem chave). Regras de uso deles: no máximo 1 consulta por segundo
// e um User-Agent que identifique o site — por isso uma fila só, em segundo
// plano: a cada 5 min (e logo depois de criar um anúncio) pega os imóveis
// ainda sem coordenada, inclusive os que chegam pela integração/planilha.
// Endereço não achado: tenta bairro + cidade; geocodedAt marca a tentativa
// pra não insistir. GEOCODER_URL troca o servidor (testes);
// GEOCODING_DISABLED=1 desliga.

const GEOCODER_URL = process.env.GEOCODER_URL ?? "https://nominatim.openstreetmap.org";
const USER_AGENT = "NovoSeminovo/1.0 (+https://novoseminovo.com.br)";
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const BATCH = 30;
const GAP_MS = 1100;

type Point = { lat: number; lng: number };

@Injectable()
export class GeocodingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GeocodingService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private again = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.GEOCODING_DISABLED === "1") return;
    this.timer = setInterval(() => this.kick(), SWEEP_INTERVAL_MS);
    setTimeout(() => this.kick(), 30_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // Chamado depois de criar anúncio: roda agora (ou logo depois da rodada atual).
  kick(): void {
    if (process.env.GEOCODING_DISABLED === "1") return;
    if (this.running) {
      this.again = true;
      return;
    }
    void this.sweep();
  }

  private async sweep(): Promise<void> {
    this.running = true;
    try {
      do {
        this.again = false;
        const pending = await this.prisma.listing.findMany({
          where: { type: "property", geocodedAt: null, status: { in: ["active", "pending_review", "paused"] } },
          include: { propertyDetails: { select: { streetAddress: true } } },
          orderBy: { createdAt: "desc" },
          take: BATCH,
        });
        for (const listing of pending) {
          const point =
            (listing.propertyDetails?.streetAddress
              ? await this.search({ street: listing.propertyDetails.streetAddress, city: listing.city, state: listing.state })
              : undefined) ??
            (listing.neighborhood ? await this.search({ q: `${listing.neighborhood}, ${listing.city} - ${listing.state}` }) : undefined) ??
            (await this.search({ q: `${listing.city} - ${listing.state}` }));
          await this.prisma.listing.update({
            where: { id: listing.id },
            data: { geocodedAt: new Date(), ...(point ? { latitude: point.lat, longitude: point.lng } : {}) },
          });
        }
        if (pending.length === BATCH) this.again = true;
      } while (this.again);
    } catch (error) {
      this.logger.warn(`Geocodificação parou: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async search(params: Record<string, string>): Promise<Point | undefined> {
    await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    const query = new URLSearchParams({ ...params, country: "Brasil", format: "json", limit: "1", countrycodes: "br" });
    // Nominatim não aceita "q" junto com campos estruturados.
    if (params.q) query.delete("country");
    try {
      const res = await fetch(`${GEOCODER_URL}/search?${query.toString()}`, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`geocoder respondeu ${res.status}`);
      const [first] = (await res.json()) as { lat?: string; lon?: string }[];
      const lat = Number(first?.lat);
      const lng = Number(first?.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) && first ? { lat, lng } : undefined;
    } catch (error) {
      // Fora do ar: não marca a tentativa — a próxima rodada tenta de novo.
      throw new Error(`consulta de endereço falhou: ${(error as Error).message}`);
    }
  }
}
