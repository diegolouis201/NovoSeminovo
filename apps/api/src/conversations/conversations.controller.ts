import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { SendMessageInputSchema } from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { acquisitionFrom } from "../common/acquisition";
import { parseOrBadRequest } from "../common/parse";
import { ConversationsService } from "./conversations.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post("listings/:id/conversations")
  start(@CurrentUser() user: { id: string }, @Param("id") listingId: string, @Req() request: Request) {
    return this.conversationsService.startConversation(user.id, listingId, acquisitionFrom(request));
  }

  @Post("leads/:id/conversation")
  openForLead(@CurrentUser() user: { id: string }, @Param("id") leadId: string) {
    return this.conversationsService.openForLead(user.id, leadId);
  }

  @Get("me/conversations")
  listMine(@CurrentUser() user: { id: string }) {
    return this.conversationsService.listMine(user.id);
  }

  @Get("conversations/:id")
  getDetail(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.conversationsService.getDetail(id, user.id);
  }

  @Post("conversations/:id/messages")
  sendMessage(@CurrentUser() user: { id: string }, @Param("id") id: string, @Body() body: unknown) {
    const input = parseOrBadRequest(SendMessageInputSchema, body);
    return this.conversationsService.sendMessage(id, user.id, input.body);
  }
}
