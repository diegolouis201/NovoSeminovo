import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { SendMessageInputSchema } from "@novoseminovo/shared-types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { ConversationsService } from "./conversations.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post("listings/:id/conversations")
  start(@CurrentUser() user: { id: string }, @Param("id") listingId: string) {
    return this.conversationsService.startConversation(user.id, listingId);
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
