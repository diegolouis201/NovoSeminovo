import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminGuard } from "../admin/admin.guard";
import { OpsAgentsService } from "./agents.service";
import { GoalsService } from "./goals.service";
import { OperationsController } from "./operations.controller";
import { OperationsService } from "./operations.service";
import { TaskQueueService } from "./task-queue.service";
import { OpsToolsService } from "./tools.service";
import { UsageService } from "./usage.service";

@Module({
  imports: [AuthModule, NotificationsModule, AdminModule],
  controllers: [OperationsController],
  providers: [OperationsService, TaskQueueService, OpsToolsService, UsageService, GoalsService, OpsAgentsService, AdminGuard],
  exports: [OperationsService, OpsToolsService, TaskQueueService],
})
export class OperationsModule {}
