import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
