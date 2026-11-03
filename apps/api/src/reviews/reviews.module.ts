import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ReviewsController } from "./reviews.controller";
import { ReviewModerationService } from "./review-moderation.service";

@Module({ imports: [AuthModule], controllers: [ReviewsController], providers: [ReviewModerationService] })
export class ReviewsModule {}
