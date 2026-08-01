import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { TicketStatus as SharedTicketStatus } from "@finserve/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { assertTicketTransition, buildTicketIdempotencyKey } from "./ticket-state";

interface CreateFromAiInput {
  userId: string;
  conversationId: string;
  aiRunId: string;
  requestId?: string;
  category: string;
  reason: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
}

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromAi(input: CreateFromAiInput) {
    const idempotencyKey = buildTicketIdempotencyKey(input.userId, input.conversationId);
    const existing = await this.prisma.ticket.findUnique({ where: { idempotencyKey } });
    if (existing) {
      await this.prisma.aiRun.update({
        where: { id: input.aiRunId },
        data: { status: "ESCALATED", metadata: { reason: input.reason, ticketId: existing.id } }
      });
      return existing;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const ticket = await tx.ticket.create({
          data: {
            ticketNo: generateTicketNo(),
            userId: input.userId,
            conversationId: input.conversationId,
            category: input.category,
            priority: input.priority as TicketPriority,
            status: TicketStatus.PENDING,
            idempotencyKey
          }
        });

        await tx.ticketEvent.create({
          data: {
            ticketId: ticket.id,
            eventType: "CREATED",
            operatorType: "AI",
            payload: { category: input.category, reason: input.reason, requestId: input.requestId }
          }
        });

        await tx.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            authorType: "AI",
            content: `AI 转人工原因：${input.reason}`
          }
        });

        await tx.conversation.update({
          where: { id: input.conversationId },
          data: { status: "TRANSFERRED_TO_HUMAN" }
        });

        await tx.aiRun.update({
          where: { id: input.aiRunId },
          data: {
            status: "ESCALATED",
            metadata: { reason: input.reason, ticketId: ticket.id }
          }
        });

        return ticket;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { idempotencyKey } });
        return ticket;
      }
      throw error;
    }
  }

  async createManual(input: { userId: string; conversationId?: string; category: string; reason: string }) {
    if (input.conversationId) {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: input.conversationId },
        select: { userId: true }
      });
      if (!conversation) {
        throw new NotFoundException("会话不存在");
      }
      if (conversation.userId !== input.userId) {
        throw new ForbiddenException("不能为他人的会话创建工单");
      }
    }

    const conversationId = input.conversationId ?? "manual";
    const idempotencyKey = buildTicketIdempotencyKey(input.userId, conversationId, `manual-${input.category}`);
    const existing = await this.prisma.ticket.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return existing;
    }

    return this.prisma.ticket.create({
      data: {
        ticketNo: generateTicketNo(),
        userId: input.userId,
        conversationId: input.conversationId,
        category: input.category,
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.PENDING,
        idempotencyKey,
        events: {
          create: {
            eventType: "CREATED",
            operatorType: "USER",
            operatorId: input.userId,
            payload: { reason: input.reason }
          }
        },
        messages: {
          create: {
            authorType: "USER",
            authorId: input.userId,
            content: input.reason
          }
        }
      }
    });
  }

  async listForUser(userId: string) {
    return this.prisma.ticket.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: ticketListSelect
    });
  }

  async listForAgent(filters: { status?: string; category?: string; q?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const search = filters.q?.trim();
    const where: Prisma.TicketWhereInput = {
      status: parseTicketStatus(filters.status),
      category: filters.category || undefined,
      OR: search
        ? [
            { ticketNo: { contains: search, mode: "insensitive" } },
            { user: { name: { contains: search, mode: "insensitive" } } },
            { user: { email: { contains: search, mode: "insensitive" } } }
          ]
        : undefined
    };
    const [items, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }, { id: "asc" }],
        select: ticketListSelect,
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.ticket.count({ where })
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async getForUser(ticketId: string, userId: string) {
    const ticket = await this.getDetail(ticketId);
    if (!ticket || ticket.userId !== userId) {
      throw new NotFoundException("工单不存在");
    }
    return ticket;
  }

  async getForAgent(ticketId: string) {
    const ticket = await this.getDetail(ticketId);
    if (!ticket) {
      throw new NotFoundException("工单不存在");
    }
    return ticket;
  }

  async addUserMessage(ticketId: string, userId: string, content: string) {
    await this.getForUser(ticketId, userId);
    return this.prisma.ticketMessage.create({
      data: {
        ticketId,
        authorId: userId,
        authorType: "USER",
        content
      }
    });
  }

  async addAgentReply(input: { ticketId: string; agentId: string; content: string; nextStatus?: SharedTicketStatus }) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: input.ticketId } });
    if (!ticket) {
      throw new NotFoundException("工单不存在");
    }

    const nextStatus = input.nextStatus;
    if (nextStatus) {
      assertTicketTransition(ticket.status as SharedTicketStatus, nextStatus);
    }

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.ticketMessage.create({
        data: {
          ticketId: input.ticketId,
          authorId: input.agentId,
          authorType: "AGENT",
          content: input.content
        }
      });

      await tx.ticketEvent.create({
        data: {
          ticketId: input.ticketId,
          eventType: "AGENT_REPLIED",
          operatorType: "AGENT",
          operatorId: input.agentId,
          payload: { messageId: message.id }
        }
      });

      if (nextStatus) {
        await tx.ticket.update({
          where: { id: input.ticketId },
          data: { status: nextStatus as TicketStatus }
        });
        await tx.ticketEvent.create({
          data: {
            ticketId: input.ticketId,
            eventType: "STATUS_CHANGED",
            operatorType: "AGENT",
            operatorId: input.agentId,
            payload: { from: ticket.status, to: nextStatus }
          }
        });
      }

      return message;
    });
  }

  async updateStatus(ticketId: string, operatorId: string, nextStatus: SharedTicketStatus) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new NotFoundException("工单不存在");
    }

    try {
      assertTicketTransition(ticket.status as SharedTicketStatus, nextStatus);
    } catch {
      throw new BadRequestException("当前状态不允许执行该操作");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { id: ticketId },
        data: { status: nextStatus as TicketStatus }
      });
      await tx.ticketEvent.create({
        data: {
          ticketId,
          eventType: "STATUS_CHANGED",
          operatorType: "AGENT",
          operatorId,
          payload: { from: ticket.status, to: nextStatus }
        }
      });
      return updated;
    });
  }

  private getDetail(ticketId: string) {
    return this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        conversation: {
          include: {
            messages: { orderBy: { createdAt: "asc" } },
            aiRuns: {
              orderBy: { createdAt: "desc" },
              include: { toolCalls: { orderBy: { createdAt: "asc" } } }
            }
          }
        },
        events: { orderBy: { createdAt: "asc" } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, email: true, role: true } } }
        }
      }
    });
  }
}

const ticketListSelect = {
  id: true,
  ticketNo: true,
  category: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { name: true, email: true } }
} as const;

function parseTicketStatus(status?: string) {
  if (!status) {
    return undefined;
  }
  if (!Object.values(TicketStatus).includes(status as TicketStatus)) {
    return undefined;
  }
  return status as TicketStatus;
}

function generateTicketNo() {
  const now = new Date();
  const date = now.toISOString().slice(2, 10).replaceAll("-", "");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `FS-${date}-${suffix}`;
}
