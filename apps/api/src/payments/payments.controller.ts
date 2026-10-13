import { Controller, Get } from "@nestjs/common";
import type { PaymentsStatus } from "@novoseminovo/shared-types";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get("status")
  getStatus(): PaymentsStatus {
    return { stripeEnabled: this.paymentsService.isEnabled() };
  }
}
