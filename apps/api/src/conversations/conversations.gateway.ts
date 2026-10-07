import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { RealtimeMessage } from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

// Só cobre o lado de "receber ao vivo" — enviar continua sendo o POST
// /conversations/:id/messages de sempre (ConversationsService chama
// emitNewMessage depois de gravar). Quem envia já vê a própria mensagem na
// hora porque o formulário recarrega a página (revalidatePath); o socket
// existe pra quem está do outro lado da conversa, sem precisar atualizar.
@Injectable()
@WebSocketGateway({ cors: { origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" } })
export class ConversationsGateway implements OnGatewayConnection {
  @WebSocketServer() private server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token);
      client.data.userId = payload.sub;
    } catch {
      client.disconnect();
    }
  }

  // Confere que quem está entrando na "sala" realmente participa da
  // conversa — sem isso, qualquer socket autenticado poderia escutar
  // mensagens de uma conversa alheia só sabendo o id.
  @SubscribeMessage("join")
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId?: string },
  ): Promise<void> {
    const userId = client.data.userId as string | undefined;
    const conversationId = body?.conversationId;
    if (!userId || !conversationId) return;

    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return;
    if (conversation.buyerId !== userId && conversation.sellerUserId !== userId) return;

    await client.join(conversationId);
  }

  emitNewMessage(message: RealtimeMessage): void {
    this.server.to(message.conversationId).emit("message", message);
  }
}
