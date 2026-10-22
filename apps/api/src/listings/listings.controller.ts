import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { memoryStorage } from "multer";
import {
  CreateListingInputSchema,
  CreateReportInputSchema,
  CreateReviewInputSchema,
  FinancingSimulationInputSchema,
  GenerateListingDraftInputSchema,
  PropertyProfileInputSchema,
  ReorderPhotosInputSchema,
  UpdateListingStatusInputSchema,
  UpdatePhotoCaptionInputSchema,
  VehicleProfileInputSchema,
  type Role,
} from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { AiService } from "./ai.service";
import { ListingsService, MAX_LISTING_PHOTOS, type ListingSearchQuery } from "./listings.service";
import { FipeService } from "../vehicles/fipe.service";
import { SocialAssetsService } from "./social-assets.service";

const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Buffer em memória em vez de gravar direto no disco (diskStorage): quem
// decide onde o arquivo final mora é ListingsService.addPhotos, via
// PhotoStorage (disco local ou S3/R2 — ver common/storage.ts), não o multer.
const photosInterceptor = FilesInterceptor("photos", MAX_LISTING_PHOTOS, {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_PHOTO_TYPES.has(file.mimetype)) {
      callback(new BadRequestException("Envie apenas imagens JPEG, PNG ou WebP."), false);
      return;
    }
    callback(null, true);
  },
});

const ALLOWED_CRLV_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

// Mesmo motivo do photosInterceptor acima: buffer em memória, nunca grava
// em disco. O CRLV carrega dado pessoal do proprietário (nome, CPF) que não
// faz parte do que o anúncio guarda — ver AiService.extractCrlvData.
const crlvInterceptor = FileInterceptor("crlv", {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_CRLV_TYPES.has(file.mimetype)) {
      callback(new BadRequestException("Envie o CRLV em imagem (JPEG, PNG, WebP) ou PDF."), false);
      return;
    }
    callback(null, true);
  },
});

@Controller("listings")
export class ListingsController {
  constructor(
    private readonly listingsService: ListingsService,
    private readonly aiService: AiService,
    private readonly socialAssetsService: SocialAssetsService,
    private readonly fipe: FipeService,
  ) {}

  // Precisa vir antes de ":id" — mesmo caso de "popular-brands"/"mine".
  @Get("ai-status")
  aiStatus() {
    return { aiEnabled: this.aiService.isEnabled() };
  }

  @UseGuards(JwtAuthGuard)
  @Post("generate-draft")
  generateDraft(@Body() body: unknown) {
    const input = parseOrBadRequest(GenerateListingDraftInputSchema, body);
    return this.aiService.generateDraft(input.assetType, input.freeText);
  }

  // Leitura automática do CRLV na página de anunciar (ver AiService ->
  // extractCrlvData). Stateless de propósito — não depende de um anúncio já
  // existir, então fica fora do ListingsService.
  @UseGuards(JwtAuthGuard)
  @Post("crlv-extract")
  @UseInterceptors(crlvInterceptor)
  extractCrlv(@UploadedFile() file: Express.Multer.File, @Body() body: { plateStart?: string }) {
    if (!file) throw new BadRequestException("Envie o CRLV em imagem ou PDF.");
    return this.aiService.extractCrlvData(file.buffer, file.mimetype, body.plateStart?.trim() || undefined);
  }

  @Get()
  findAll(@Query() query: ListingSearchQuery) {
    return this.listingsService.search(query);
  }

  // Lista pro sitemap.xml do site (ver apps/web/app/sitemap.ts). Também
  // antes de ":id", pelo mesmo motivo de "popular-brands" abaixo.
  @Get("sitemap")
  sitemap() {
    return this.listingsService.sitemapEntries();
  }

  // Precisa vir antes de ":id" — mesmo motivo do "mine" abaixo: "popular-brands"
  // seria casado como um :id senão.
  @Get("popular-brands")
  popularBrands() {
    return this.listingsService.popularBrands();
  }

  // Mesmo motivo de "popular-brands" acima.
  @Get("price-suggestion")
  suggestPrice(
    @Query()
    query: { assetType?: string; brand?: string; model?: string; propertyType?: string; city?: string },
  ) {
    return this.listingsService.suggestPrice(query);
  }

  // Lista "Escolha uma versão" e preço FIPE no /anunciar (mesmo motivo de
  // "popular-brands" pra ficar antes de ":id"). Públicos: só repassam a
  // tabela FIPE, com cache (ver FipeService).
  @Get("fipe-brands")
  fipeBrands() {
    return this.fipe.listBrands();
  }

  @Get("fipe-versions")
  fipeVersions(@Query() query: { brand?: string; model?: string; yearModel?: string }) {
    const year = Number(query.yearModel);
    if (!query.brand || !query.model) return [];
    return this.fipe.listVersions(query.brand, query.model, Number.isInteger(year) && year > 1950 ? year : undefined);
  }

  @Get("fipe-price")
  async fipePrice(@Query() query: { brand?: string; modelCode?: string; yearModel?: string }) {
    const code = Number(query.modelCode);
    const year = Number(query.yearModel);
    if (!query.brand || !Number.isInteger(code) || !Number.isInteger(year)) return null;
    return (await this.fipe.priceForVersion(query.brand, code, year)) ?? null;
  }

  // Botão "qual carro é ideal pra mim?" — público (não exige login) porque é
  // um recurso de pré-venda, útil antes mesmo de a pessoa criar conta.
  @Post("recommend-vehicle")
  recommendVehicle(@Body() body: unknown) {
    const input = parseOrBadRequest(VehicleProfileInputSchema, body);
    return this.listingsService.recommendVehicle(input);
  }

  // Mesma ideia acima, pra imóvel.
  @Post("recommend-property")
  recommendProperty(@Body() body: unknown) {
    const input = parseOrBadRequest(PropertyProfileInputSchema, body);
    return this.listingsService.recommendProperty(input);
  }

  // Precisa vir antes de ":id" — senão o Nest casaria "mine" como um :id.
  @UseGuards(JwtAuthGuard)
  @Get("mine")
  findMine(@CurrentUser() user: { id: string }) {
    return this.listingsService.listMine(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(CreateListingInputSchema, body);
    return this.listingsService.create(user.id, input);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(":id")
  findOne(@CurrentUser() user: { id: string; role: Role } | undefined, @Param("id") id: string) {
    return this.listingsService.getDetail(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/status")
  updateStatus(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(UpdateListingStatusInputSchema, body);
    return this.listingsService.updateStatus(id, user.id, input);
  }

  @Post(":id/financing-simulations")
  simulate(@Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(FinancingSimulationInputSchema.omit({ listingId: true }), body);
    return this.listingsService.simulateFinancing(id, input);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post(":id/whatsapp-clicks")
  registerWhatsappClick(@CurrentUser() user: { id: string } | undefined, @Param("id") id: string) {
    return this.listingsService.registerWhatsappClick(id, user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/reports")
  createReport(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(CreateReportInputSchema, body);
    return this.listingsService.createReport(id, user.id, input.reason);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/reviews")
  createReview(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(CreateReviewInputSchema, body);
    return this.listingsService.createReview(id, user.id, input);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/photos")
  @UseInterceptors(photosInterceptor)
  addPhotos(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException("Envie pelo menos uma foto.");
    return this.listingsService.addPhotos(id, user.id, files);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id/photos/:photoId")
  removePhoto(@CurrentUser() user: { id: string }, @Param("id") id: string, @Param("photoId") photoId: string) {
    return this.listingsService.removePhoto(id, user.id, photoId);
  }

  // Disparado pela própria página de fotos logo após o upload — ver
  // AiService.classifyVehiclePhotos. Sem IA habilitada, devolve as fotos
  // como estão (ver ListingsService.classifyPhotos).
  @UseGuards(JwtAuthGuard)
  @Post(":id/photos/classify")
  classifyPhotos(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.listingsService.classifyPhotos(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/photos/reorder")
  reorderPhotos(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(ReorderPhotosInputSchema, body);
    return this.listingsService.reorderPhotos(id, user.id, input.order, input.coverPhotoId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/photos/:photoId/caption")
  updatePhotoCaption(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Param("photoId") photoId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrBadRequest(UpdatePhotoCaptionInputSchema, body);
    return this.listingsService.updatePhotoCaption(id, user.id, photoId, input.caption);
  }

  // Imagens prontas pra postar no Instagram (feed/story/carrossel) a partir
  // das fotos já cadastradas no anúncio — ver SocialAssetsService. Sempre
  // geradas na hora (sem cache em disco), já que o dono pode reordenar ou
  // trocar fotos a qualquer momento.
  @UseGuards(JwtAuthGuard)
  @Get(":id/social/feed")
  async socialFeedImage(@CurrentUser() user: { id: string }, @Param("id") id: string, @Res() res: Response) {
    const buffer = await this.socialAssetsService.generateFeedImage(id, user.id);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", 'inline; filename="novoseminovo-feed.jpg"');
    res.send(buffer);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/social/story")
  async socialStoryImage(@CurrentUser() user: { id: string }, @Param("id") id: string, @Res() res: Response) {
    const buffer = await this.socialAssetsService.generateStoryImage(id, user.id);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", 'inline; filename="novoseminovo-story.jpg"');
    res.send(buffer);
  }

  // Precisa vir antes de ":id/social/carousel/:index" — mesmo caso de
  // "ai-status"/"popular-brands" no topo do arquivo.
  @UseGuards(JwtAuthGuard)
  @Get(":id/social/carousel/count")
  async socialCarouselCount(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    const length = await this.socialAssetsService.carouselLength(id, user.id);
    return { length };
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/social/carousel/:index")
  async socialCarouselImage(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Param("index", ParseIntPipe) index: number,
    @Res() res: Response,
  ) {
    const buffer = await this.socialAssetsService.generateCarouselImage(id, user.id, index);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `inline; filename="novoseminovo-carrossel-${index + 1}.jpg"`);
    res.send(buffer);
  }
}
