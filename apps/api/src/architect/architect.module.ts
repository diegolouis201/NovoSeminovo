import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ArchitectController } from "./architect.controller";
import { ArchitectService } from "./architect.service";
import { GeminiImageService } from "./gemini-image.service";

@Module({
  imports: [AuthModule],
  controllers: [ArchitectController],
  providers: [ArchitectService, GeminiImageService],
})
export class ArchitectModule {}
