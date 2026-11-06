import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@novoseminovo/db";
import type {
  CreateVehicleEventInput,
  PendingServiceConfirmation,
  RegisterVehicleInput,
  VehicleEvent,
  VehicleLetterInput,
  VehicleProfile,
  WorkshopOption,
} from "@novoseminovo/shared-types";
import { VehicleLetterInputSchema, fatosDoCarro, historiaDoCarro } from "@novoseminovo/shared-types";
import { VehicleStoryAi } from "./historia-ia";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { getPhotoStorage } from "../common/storage";
import { hashPlate, maskPlate } from "./plate.util";
import { toVehicleEvent, toVehicleProfile, vehicleInclude } from "./vehicles.mapper";
import { sanitizeUpload } from "../common/image-safety";
import { findContactInfo } from "../common/contact-filter";

// O Diário do Carro é público: nada de telefone, e-mail, link ou @ no texto
// (o contato acontece pelo chat do anúncio, que protege contra golpe).
function semContato(texto: string | undefined, onde: string) {
  const kind = texto ? findContactInfo(texto) : undefined;
  if (kind) throw new BadRequestException(`Não dá para colocar ${kind} ${onde} — o Diário do Carro é público. Remova e tente de novo.`);
}

export type ResolveVehicleForListingInput = {
  plate: string;
  ownerUserId: string;
  brandId: string;
  modelId: string;
  yearManufacture?: number;
  yearModel?: number;
  color?: string;
};

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly story: VehicleStoryAi = new VehicleStoryAi(),
  ) {}

  // Perfil + seguidores + resumo em dia (resumo velho não aparece; se a IA
  // estiver ligada, um novo é gerado em segundo plano).
  private async enriquecer(vehicle: Parameters<typeof toVehicleProfile>[0], viewerId: string | undefined): Promise<VehicleProfile> {
    const perfil = toVehicleProfile(vehicle, viewerId);
    const [seguidores, meu] = await Promise.all([
      this.prisma.vehicleFollow.count({ where: { vehicleId: vehicle.id } }),
      viewerId ? this.prisma.vehicleFollow.findUnique({ where: { vehicleId_userId: { vehicleId: vehicle.id, userId: viewerId } }, select: { id: true } }) : null,
    ]);
    const chave = this.chaveResumo(perfil);
    const emDia = vehicle.resumoIa && vehicle.resumoIaChave === chave;
    if (!emDia && this.story.isEnabled()) void this.atualizarResumo(vehicle.id).catch(() => undefined);
    return { ...perfil, seguidores, seguindo: Boolean(meu), resumo: emDia ? vehicle.resumoIa! : undefined };
  }

  private chaveResumo(perfil: VehicleProfile): string {
    return createHash("sha256").update(fatosDoCarro(perfil, historiaDoCarro(perfil)).join("\n")).digest("hex");
  }

  private resumindo = new Map<string, Promise<void>>();

  // "A história em 30 segundos": só gera quando os fatos mudaram.
  async atualizarResumo(vehicleId: string): Promise<void> {
    const emAndamento = this.resumindo.get(vehicleId);
    if (emAndamento) return emAndamento;
    const job = (async () => {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, include: vehicleInclude });
      if (!vehicle) return;
      const perfil = toVehicleProfile(vehicle, undefined);
      const chave = this.chaveResumo(perfil);
      if (vehicle.resumoIa && vehicle.resumoIaChave === chave) return;
      const texto = await this.story.resumir(fatosDoCarro(perfil, historiaDoCarro(perfil)));
      if (texto) await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { resumoIa: texto, resumoIaChave: chave } });
    })().finally(() => this.resumindo.delete(vehicleId));
    this.resumindo.set(vehicleId, job);
    return job;
  }

  // Seguir o carro (Diário do Carro): aviso quando volta ao mercado ou baixa de preço.
  async follow(vehicleId: string, userId: string): Promise<void> {
    const exists = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Veículo ${vehicleId} não encontrado`);
    await this.prisma.vehicleFollow.upsert({ where: { vehicleId_userId: { vehicleId, userId } }, create: { vehicleId, userId }, update: {} });
  }

  async unfollow(vehicleId: string, userId: string): Promise<void> {
    await this.prisma.vehicleFollow.deleteMany({ where: { vehicleId, userId } });
  }

  // Anúncio no ar com carro ligado ao Diário e preço menor: avisa quem segue.
  async avisarSeBaixouPreco(listingId: string, antes: number, depois: number): Promise<void> {
    if (!(depois < antes)) return;
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { status: true, ownerUserId: true, vehicleDetails: { select: { vehicleId: true } } } });
    const vehicleId = listing?.vehicleDetails?.vehicleId;
    if (!listing || listing.status !== "active" || !vehicleId) return;
    await this.avisarSeguidores(vehicleId, "preco", { listingId, preco: depois }, listing.ownerUserId);
  }

  async avisarSeguidores(vehicleId: string, motivo: "anunciado" | "preco", dados: Record<string, unknown>, exceto?: string): Promise<void> {
    const [vehicle, seguidores] = await Promise.all([
      this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { brand: { select: { name: true } }, model: { select: { name: true } }, yearModel: true } }),
      this.prisma.vehicleFollow.findMany({ where: { vehicleId, ...(exceto ? { userId: { not: exceto } } : {}) }, select: { userId: true }, take: 5000 }),
    ]);
    if (!vehicle) return;
    const nome = [vehicle.brand?.name, vehicle.model?.name, vehicle.yearModel].filter(Boolean).join(" ") || "O carro que você segue";
    for (const { userId } of seguidores) {
      await this.notifications.notify(userId, "vehicle_follow_update", { vehicleId, motivo, nome, ...dados }).catch(() => undefined);
    }
  }

  // Chamado na criação de anúncio de veículo quando a placa foi informada.
  // Mesma placa já vista antes = mesmo Vehicle (o histórico persiste entre
  // anúncios e donos); placa nova = Vehicle novo. Troca de dono é só
  // detectada aqui (comparando currentOwnerId), nunca declarada pelo
  // próprio usuário — ver CreateVehicleEventInputSchema.
  async resolveForListing(input: ResolveVehicleForListingInput): Promise<string> {
    const plateHash = hashPlate(input.plate);
    const existing = await this.prisma.vehicle.findUnique({ where: { plateHash } });

    if (!existing) {
      const created = await this.prisma.vehicle.create({
        data: {
          plateHash,
          plateMasked: maskPlate(input.plate),
          brandId: input.brandId,
          modelId: input.modelId,
          yearManufacture: input.yearManufacture,
          yearModel: input.yearModel,
          color: input.color,
          currentOwnerId: input.ownerUserId,
        },
      });
      return created.id;
    }

    if (existing.currentOwnerId && existing.currentOwnerId !== input.ownerUserId) {
      await this.prisma.$transaction([
        this.prisma.vehicleEvent.create({
          data: {
            vehicleId: existing.id,
            type: "ownership_change",
            source: "system",
            title: "Troca de dono",
            occurredAt: new Date(),
            createdByUserId: input.ownerUserId,
          },
        }),
        this.prisma.vehicle.update({
          where: { id: existing.id },
          data: { currentOwnerId: input.ownerUserId },
        }),
      ]);
    }

    return existing.id;
  }

  // Disparado depois que o anúncio é criado de verdade (ver
  // ListingsService.create) — registra no histórico do carro que um novo
  // anúncio foi publicado, pra quem olhar o Passaporte Digital ver que o
  // carro voltou ao mercado.
  async logListingPublished(vehicleId: string, userId: string, listingTitle: string): Promise<void> {
    await this.prisma.vehicleEvent.create({
      data: {
        vehicleId,
        type: "listing_published",
        source: "system",
        title: "Anúncio publicado",
        description: listingTitle,
        occurredAt: new Date(),
        createdByUserId: userId,
      },
    });
    await this.avisarSeguidores(vehicleId, "anunciado", { titulo: listingTitle }, userId);
  }

  // Marca/modelo são texto livre (sem consulta a Detran/FIPE no MVP) — a
  // primeira pessoa a citar "Fiat Argo" cria as duas linhas do catálogo, as
  // próximas só reaproveitam (busca case-insensitive; connectOrCreate não
  // serve aqui porque a constraint de unicidade do Postgres é case-sensitive).
  // Compartilhado entre ListingsService.create e registerOwned abaixo — único
  // lugar que resolve marca/modelo, pra nunca ter duas grafias da mesma marca.
  async resolveBrandAndModel(brandName: string, modelName: string) {
    let brand = await this.prisma.vehicleBrand.findFirst({
      where: { name: { equals: brandName, mode: "insensitive" } },
    });
    if (!brand) {
      try {
        brand = await this.prisma.vehicleBrand.create({ data: { name: brandName } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          brand = await this.prisma.vehicleBrand.findFirstOrThrow({
            where: { name: { equals: brandName, mode: "insensitive" } },
          });
        } else {
          throw error;
        }
      }
    }

    let model = await this.prisma.vehicleModel.findFirst({
      where: { brandId: brand.id, name: { equals: modelName, mode: "insensitive" } },
    });
    if (!model) {
      try {
        model = await this.prisma.vehicleModel.create({ data: { name: modelName, brandId: brand.id } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          model = await this.prisma.vehicleModel.findFirstOrThrow({
            where: { brandId: brand.id, name: { equals: modelName, mode: "insensitive" } },
          });
        } else {
          throw error;
        }
      }
    }

    return {
      brand: { connect: { id: brand.id } },
      model: { connect: { id: model.id } },
    };
  }

  // Cadastro direto do veículo pelo dono — sem anúncio nenhum envolvido.
  // É a porta de entrada pra quem quer começar o histórico do carro agora e
  // só pensar em vender daqui a um tempo. Mesma lógica de
  // "placa já existe = mesmo Vehicle" do resolveForListing.
  async registerOwned(ownerUserId: string, input: RegisterVehicleInput): Promise<VehicleProfile> {
    const brandModel = await this.resolveBrandAndModel(input.brand, input.model);
    const vehicleId = await this.resolveForListing({
      plate: input.plate,
      ownerUserId,
      brandId: brandModel.brand.connect.id,
      modelId: brandModel.model.connect.id,
      yearManufacture: input.yearManufacture,
      yearModel: input.yearModel,
      color: input.color,
    });
    return this.getProfile(vehicleId, ownerUserId);
  }

  // "Meus veículos" — tudo que a pessoa é dona atual, com ou sem anúncio
  // publicado. Perfil completo (com timeline) porque a lista tende a ser
  // curta: poucas pessoas têm dezenas de carros cadastrados.
  async findMine(ownerUserId: string): Promise<VehicleProfile[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { currentOwnerId: ownerUserId },
      include: vehicleInclude,
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(vehicles.map((vehicle) => this.enriquecer(vehicle, ownerUserId)));
  }

  async getProfile(vehicleId: string, viewerId: string | undefined): Promise<VehicleProfile> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: vehicleInclude,
    });
    if (!vehicle) throw new NotFoundException(`Veículo ${vehicleId} não encontrado`);
    return this.enriquecer(vehicle, viewerId);
  }

  // Único jeito de olhar o Passaporte sem ter o link direto — mesmo hash da
  // placa usado em resolveForListing, nunca comparamos a placa em texto puro.
  async findByPlate(plate: string, viewerId: string | undefined): Promise<VehicleProfile | undefined> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { plateHash: hashPlate(plate) },
      include: vehicleInclude,
    });
    return vehicle ? this.enriquecer(vehicle, viewerId) : undefined;
  }

  // Lista pro <select> de "oficina que realizou o serviço" — só parceiros do
  // tipo workshop e já verificados pela moderação, pra não virar uma lista
  // de oficina fantasma que qualquer um cadastra só pra "autoconfirmar".
  async listWorkshops(): Promise<WorkshopOption[]> {
    const workshops = await this.prisma.partner.findMany({
      where: { type: "workshop", verifiedAt: { not: null } },
      orderBy: { legalName: "asc" },
      select: { id: true, legalName: true },
    });
    return workshops;
  }

  // Só o dono atual pode registrar um evento — sem isso, qualquer pessoa
  // logada poderia inflar (ou sujar) o histórico de um carro que não é dela.
  // Comprovante (files) é obrigatório — validado no controller antes de
  // chegar aqui, porque é sobre a requisição (multipart), não sobre dado.
  async addEvent(
    vehicleId: string,
    userId: string,
    input: CreateVehicleEventInput,
    files: Express.Multer.File[],
  ): Promise<VehicleEvent> {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException(`Veículo ${vehicleId} não encontrado`);
    if (vehicle.currentOwnerId !== userId) {
      throw new ForbiddenException("Só o dono atual pode adicionar um evento ao histórico deste veículo.");
    }

    semContato(input.title, "no título");
    semContato(input.description, "na descrição");

    let workshop: { id: string; legalName: string; ownerUserId: string } | null = null;
    if (input.workshopPartnerId) {
      workshop = await this.prisma.partner.findFirst({
        where: { id: input.workshopPartnerId, type: "workshop", verifiedAt: { not: null } },
        select: { id: true, legalName: true, ownerUserId: true },
      });
      if (!workshop) throw new BadRequestException("Oficina inválida.");
    }

    const storage = getPhotoStorage();
    const safeFiles = await Promise.all(files.map((file) => sanitizeUpload(file)));
    const photoUrls = await Promise.all(
      safeFiles.map((file) => storage.save(file.buffer, file.originalname, file.mimetype)),
    );

    const event = await this.prisma.vehicleEvent.create({
      data: {
        vehicleId,
        type: input.type,
        source: "owner_reported",
        title: input.title,
        description: input.description,
        mileageAtEvent: input.mileageAtEvent,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        photoUrls,
        createdByUserId: userId,
        verifiedByPartnerId: workshop?.id,
      },
      include: vehicleInclude.events.include,
    });

    if (workshop) {
      const owner = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      await this.notifications.notify(workshop.ownerUserId, "service_confirmation_requested", {
        eventId: event.id,
        ownerName: owner?.name,
        eventTitle: event.title,
        vehicleLabel: [vehicle.yearModel, vehicle.color].filter(Boolean).join(" "),
      });
    }

    return toVehicleEvent(event);
  }

  // Carta para o próximo dono: uma por dono (por capítulo). Escrever de
  // novo substitui a carta deste dono; a do dono anterior fica.
  async saveLetter(vehicleId: string, userId: string, raw: VehicleLetterInput): Promise<void> {
    const input = VehicleLetterInputSchema.parse(raw);
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException(`Veículo ${vehicleId} não encontrado`);
    if (vehicle.currentOwnerId !== userId) throw new ForbiddenException("Só o dono atual pode escrever a carta deste carro.");
    semContato(input.texto, "na carta");
    const troca = await this.prisma.vehicleEvent.findFirst({ where: { vehicleId, type: "ownership_change" }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } });
    const atual = await this.prisma.vehicleEvent.findFirst({
      where: { vehicleId, type: "letter", createdByUserId: userId, ...(troca ? { occurredAt: { gte: troca.occurredAt } } : {}) },
      select: { id: true },
    });
    if (atual) {
      await this.prisma.vehicleEvent.update({ where: { id: atual.id }, data: { description: input.texto, occurredAt: new Date() } });
    } else {
      await this.prisma.vehicleEvent.create({
        data: { vehicleId, type: "letter", source: "owner_reported", title: "Carta para o próximo dono", description: input.texto, occurredAt: new Date(), createdByUserId: userId },
      });
    }
  }

  // Fila de confirmação da oficina logada — precisa achar o Partner dela
  // igual ListingsService.create faz pro dono de loja (dono OU membro da
  // equipe operam o mesmo painel).
  private async findWorkshopForUser(userId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { type: "workshop", OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] },
    });
    if (!partner) throw new ForbiddenException("Você precisa de uma oficina cadastrada e verificada pra isso.");
    return partner;
  }

  async listPendingConfirmations(userId: string): Promise<PendingServiceConfirmation[]> {
    const workshop = await this.findWorkshopForUser(userId);
    const events = await this.prisma.vehicleEvent.findMany({
      where: { verifiedByPartnerId: workshop.id, source: "owner_reported" },
      include: { vehicle: { include: { brand: true, model: true } } },
      orderBy: { createdAt: "desc" },
    });

    return events.map((event) => ({
      eventId: event.id,
      vehicleId: event.vehicleId,
      vehicleLabel:
        [event.vehicle.brand?.name, event.vehicle.model?.name, event.vehicle.yearModel]
          .filter(Boolean)
          .join(" ") || "Veículo",
      title: event.title,
      description: event.description ?? undefined,
      mileageAtEvent: event.mileageAtEvent ?? undefined,
      occurredAt: event.occurredAt.toISOString(),
      photos: event.photoUrls,
    }));
  }

  // A própria oficina confirmando que o serviço realmente foi feito — é o
  // único jeito de um evento sair de "owner_reported" pra "partner_verified"
  // (ver comentário em VehicleEvent no schema.prisma).
  async confirmService(userId: string, eventId: string): Promise<void> {
    const workshop = await this.findWorkshopForUser(userId);
    const event = await this.prisma.vehicleEvent.findUnique({ where: { id: eventId } });
    if (!event || event.verifiedByPartnerId !== workshop.id) {
      throw new NotFoundException(`Confirmação ${eventId} não encontrada`);
    }

    await this.prisma.vehicleEvent.update({ where: { id: eventId }, data: { source: "partner_verified" } });
  }
}
