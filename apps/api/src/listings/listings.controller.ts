import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import {
  CreateListingInputSchema,
  CreateReportInputSchema,
  CreateReviewInputSchema,
  FinancingSimulationInputSchema,
  UpdateListingStatusInputSchema,
  type Role,
} from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { UPLOADS_DIR } from "../common/uploads";
import { ListingsService, type ListingSearchQuery } from "./listings.service";

const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const photosInterceptor = FilesInterceptor("photos", 8, {
  storage: diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_PHOTO_TYPES.has(file.mimetype)) {
      callback(new BadRequestException("Envie apenas imagens JPEG, PNG ou WebP."), false);
      return;
    }
    callback(null, true);
  },
});

@Controller("listings")
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  findAll(@Query() query: ListingSearchQuery) {
    return this.listingsService.search(query);
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
}
