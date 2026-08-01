import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RequestUser } from "../common/current-user.decorator";
import { AiOrchestratorService } from "../ai/ai-orchestrator.service";

type Emit = (event: "status" | "tool" | "message" | "done" | "error", data: unknown) => void;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiOrchestratorService
  ) {}

  create(user: RequestUser) {
    return this.prisma.conversation.create({
      data: {
        userId: user.id,
        title: "智能客服会话"
      }
    });
  }

  list(user: RequestUser) {
    return this.prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" }
        }
      }
    });
  }

  async messages(user: RequestUser, conversationId: string) {
    await this.assertAccess(user, conversationId);
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" }
    });
  }

  async sendMessage(params: {
    user: RequestUser;
    conversationId: string;
    content: string;
    requestId?: string;
    emit: Emit;
    signal?: AbortSignal;
  }) {
    this.logger.log(JSON.stringify({ event: "ai_turn_started", requestId: params.requestId, userId: params.user.id, conversationId: params.conversationId }));
    await this.assertAccess(params.user, params.conversationId);

    const previousHistory = await this.prisma.message.findMany({
      where: { conversationId: params.conversationId },
      orderBy: { createdAt: "desc" },
      take: 7,
      select: {
        role: true,
        content: true
      }
    });

    await this.prisma.message.create({
      data: {
        conversationId: params.conversationId,
        role: "USER",
        content: params.content
      }
    });

    const result = await this.ai.run({
      ...params,
      history: previousHistory.reverse()
    });

    const assistant = await this.prisma.message.create({
      data: {
        conversationId: params.conversationId,
        role: "ASSISTANT",
        content: result.assistantContent,
        metadata: result.ticketId ? { ticketId: result.ticketId } : undefined
      }
    });

    params.emit("done", {
      messageId: assistant.id,
      ticketId: result.ticketId
    });
    this.logger.log(JSON.stringify({ event: "ai_turn_completed", requestId: params.requestId, userId: params.user.id, conversationId: params.conversationId, ticketId: result.ticketId }));
  }

  private async assertAccess(user: RequestUser, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { userId: true }
    });
    if (!conversation) {
      throw new NotFoundException("会话不存在");
    }
    if (conversation.userId !== user.id) {
      throw new ForbiddenException("不能访问他人的会话");
    }
  }
}
