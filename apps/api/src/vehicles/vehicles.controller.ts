import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { CreateVehicleEventInputSchema, RegisterVehicleInputSchema } from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { VehiclesService } from "./vehicles.service";

const ALLOWED_PROOF_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Mesma config de ListingsController.addPhotos — buffer em memória (quem
// decide o destino final é PhotoStorage, não o multer), só imagem, até 5MB.
const proofInterceptor = FilesInterceptor("photos", 5, {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_PROOF_TYPES.has(file.mimetype)) {
      callback(new BadRequestException("Envie apenas imagens JPEG, PNG ou WebP."), false);
      return;
    }
    callback(null, true);
  },
});

@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // Precisa vir antes de ":id" — senão o Nest casaria "mine"/"workshops"/
  // "pending-confirmations" como um :id.
  @UseGuards(JwtAuthGuard)
  @Get("mine")
  findMine(@CurrentUser() user: { id: string }) {
    return this.vehiclesService.findMine(user.id);
  }

  // Público — alimenta o <select> de "oficina que realizou o serviço" sem
  // precisar estar logado pra ver as opções.
  @Get("workshops")
  listWorkshops() {
    return this.vehiclesService.listWorkshops();
  }

  @UseGuards(JwtAuthGuard)
  @Get("pending-confirmations")
  listPendingConfirmations(@CurrentUser() user: { id: string }) {
    return this.vehiclesService.listPendingConfirmations(user.id);
  }

  // Consulta pública por placa — "Passaporte consultável" sem precisar do
  // link direto do anúncio ou de "Meus veículos".
  @UseGuards(OptionalJwtAuthGuard)
  @Get("by-plate/:plate")
  getByPlate(@CurrentUser() user: { id: string } | undefined, @Param("plate") plate: string) {
    return this.vehiclesService.findByPlate(plate, user?.id);
  }

  // Cadastro direto, sem anúncio nenhum — porta de entrada pra quem quer
  // começar o histórico do carro agora, não só na hora de vender.
  @UseGuards(JwtAuthGuard)
  @Post()
  register(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(RegisterVehicleInputSchema, body);
    return this.vehiclesService.registerOwned(user.id, input);
  }

  @UseGuards(JwtAuthGuard)
  @Post("events/:eventId/confirm")
  confirmService(@CurrentUser() user: { id: string }, @Param("eventId") eventId: string) {
    return this.vehiclesService.confirmService(user.id, eventId);
  }

  // Público de propósito — o Passaporte Digital só funciona como prova de
  // confiança se qualquer comprador conseguir ver o histórico antes de
  // comprar, sem precisar estar logado.
  @UseGuards(OptionalJwtAuthGuard)
  @Get(":id")
  getProfile(@CurrentUser() user: { id: string } | undefined, @Param("id") id: string) {
    return this.vehiclesService.getProfile(id, user?.id);
  }

  // Multipart, não JSON: o comprovante (foto) é obrigatório pra registrar
  // qualquer evento, então os metadados vêm junto com o arquivo numa
  // requisição só, em vez de duas chamadas separadas.
  @UseGuards(JwtAuthGuard)
  @Post(":id/events")
  @UseInterceptors(proofInterceptor)
  addEvent(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() body: Record<string, string>,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException(
        "Envie uma foto do comprovante (nota fiscal, ordem de serviço, etc.) pra registrar o evento.",
      );
    }
    const input = parseOrBadRequest(CreateVehicleEventInputSchema, {
      ...body,
      mileageAtEvent: body.mileageAtEvent ? Number(body.mileageAtEvent) : undefined,
      workshopPartnerId: body.workshopPartnerId || undefined,
    });
    return this.vehiclesService.addEvent(id, user.id, input, files);
  }
}
