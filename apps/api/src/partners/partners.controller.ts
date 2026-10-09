import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  AddPartnerMemberInputSchema,
  CreatePartnerInputSchema,
  SubscribeToPlanInputSchema,
  UpdateLeadStatusInputSchema,
} from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { PartnersService } from "./partners.service";

@Controller()
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @UseGuards(JwtAuthGuard)
  @Post("partners")
  create(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(CreatePartnerInputSchema, body);
    return this.partnersService.create(user.id, input);
  }

  @UseGuards(JwtAuthGuard)
  @Get("partners/mine")
  getMine(@CurrentUser() user: { id: string }) {
    return this.partnersService.getMine(user.id);
  }

  @Get("partners/:slug")
  getStorefront(@Param("slug") slug: string) {
    return this.partnersService.getStorefront(slug);
  }

  @UseGuards(JwtAuthGuard)
  @Get("partners/mine/leads")
  listLeads(@CurrentUser() user: { id: string }) {
    return this.partnersService.listLeads(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("leads/:id/status")
  updateLeadStatus(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(UpdateLeadStatusInputSchema, body);
    return this.partnersService.updateLeadStatus(user.id, id, input.status);
  }

  @UseGuards(JwtAuthGuard)
  @Get("partners/mine/members")
  listMembers(@CurrentUser() user: { id: string }) {
    return this.partnersService.listMembers(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("partners/mine/members")
  addMember(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(AddPartnerMemberInputSchema, body);
    return this.partnersService.addMember(user.id, input.email);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("partners/mine/members/:memberId")
  removeMember(@CurrentUser() user: { id: string }, @Param("memberId") memberId: string) {
    return this.partnersService.removeMember(user.id, memberId);
  }

  @Get("plans")
  listPlans() {
    return this.partnersService.listPlans();
  }

  @UseGuards(JwtAuthGuard)
  @Post("partners/mine/subscription")
  subscribe(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseOrBadRequest(SubscribeToPlanInputSchema, body);
    return this.partnersService.subscribe(user.id, input.planId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("partners/mine/subscription")
  cancelSubscription(@CurrentUser() user: { id: string }) {
    return this.partnersService.cancelSubscription(user.id);
  }
}
