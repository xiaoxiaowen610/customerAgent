import { describe, expect, it, vi } from "vitest";
import { TicketsService } from "./tickets.service";

function createPrismaMock(ownerId?: string) {
  return {
    conversation: {
      findUnique: vi.fn().mockResolvedValue(ownerId ? { userId: ownerId } : null)
    },
    ticket: {
      findUnique: vi.fn(),
      create: vi.fn()
    }
  };
}

describe("manual ticket access control", () => {
  it("rejects a missing conversation", async () => {
    const prisma = createPrismaMock();
    const service = new TicketsService(prisma as any);

    await expect(
      service.createManual({
        userId: "user_1",
        conversationId: "conv_missing",
        category: "unknown",
        reason: "需要帮助"
      })
    ).rejects.toThrow("会话不存在");
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });

  it("rejects another user's conversation", async () => {
    const prisma = createPrismaMock("user_2");
    const service = new TicketsService(prisma as any);

    await expect(
      service.createManual({
        userId: "user_1",
        conversationId: "conv_2",
        category: "unknown",
        reason: "需要帮助"
      })
    ).rejects.toThrow("不能为他人的会话创建工单");
    expect(prisma.ticket.create).not.toHaveBeenCalled();
  });
});

describe("agent ticket pagination", () => {
  it("uses deterministic server-side pagination and returns metadata", async () => {
    const items = [{ id: "ticket_2" }];
    const prisma = {
      ticket: {
        findMany: vi.fn().mockResolvedValue(items),
        count: vi.fn().mockResolvedValue(3)
      }
    };
    const service = new TicketsService(prisma as any);

    await expect(service.listForAgent({ page: 2, pageSize: 1, q: "lin" })).resolves.toMatchObject({
      items,
      total: 3,
      page: 2,
      pageSize: 1,
      totalPages: 3
    });
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 1, take: 1 }));
  });
});
