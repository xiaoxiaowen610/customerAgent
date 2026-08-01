import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RequestUser } from "../common/current-user.decorator";
import { AiOrchestratorService } from "../ai/ai-orchestrator.service";

type Emit = (event: "status" | "tool" | "message" | "done" | "error", data: unknown) => void;

@Injectable()
export class ConversationsService {
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
    emit: Emit;
  }) {
    await this.assertAccess(params.user, params.conversationId);

    await this.prisma.message.create({
      data: {
        conversationId: params.conversationId,
        role: "USER",
        content: params.content
      }
    });

    const history = await this.prisma.message.findMany({
      where: { conversationId: params.conversationId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        role: true,
        content: true
      }
    });

    const result = await this.ai.run({
      ...params,
      history: history.reverse()
    });
    for (const delta of chunkText(result.assistantContent)) {
      params.emit("message", { delta });
    }

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

function chunkText(text: string) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += 18) {
    chunks.push(text.slice(index, index + 18));
  }
  return chunks;
}
