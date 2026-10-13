import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SavedSearchesController } from "./saved-searches.controller";
import { SavedSearchesService } from "./saved-searches.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [SavedSearchesController],
  providers: [SavedSearchesService],
  exports: [SavedSearchesService],
})
export class SavedSearchesModule {}
