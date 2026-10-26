import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SavedSearchesModule } from "../saved-searches/saved-searches.module";
import { AdminController } from "./admin.controller";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";
import { AdminOverviewService } from "./overview.service";
import { AutoModerationService } from "./auto-moderation.service";
import { AdminAccountsService } from "./accounts.service";

@Module({
  imports: [AuthModule, NotificationsModule, SavedSearchesModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard, AutoModerationService, AdminOverviewService, AdminAccountsService],
  exports: [AdminService, AdminOverviewService],
})
export class AdminModule {}
