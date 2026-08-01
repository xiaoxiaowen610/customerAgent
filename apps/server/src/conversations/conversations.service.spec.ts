import { describe, expect, it, vi } from "vitest";
import { ConversationsService } from "./conversations.service";

describe("conversation access control", () => {
  it("does not let an agent read an unrelated conversation through the user API", async () => {
    const prisma = {
      conversation: {
        findUnique: vi.fn().mockResolvedValue({ userId: "user_1" })
      },
      message: {
        findMany: vi.fn()
      }
    };
    const service = new ConversationsService(prisma as any, {} as any);

    await expect(
      service.messages(
        {
          id: "agent_1",
          email: "agent@finserve.dev",
          name: "Agent",
          role: "AGENT"
        },
        "conv_1"
      )
    ).rejects.toThrow("不能访问他人的会话");
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});
