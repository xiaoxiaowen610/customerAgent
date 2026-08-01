import { describe, expect, it, vi } from "vitest";
import { AiOrchestratorService } from "./ai-orchestrator.service";

const user = {
  id: "user_1",
  email: "user@finserve.dev",
  name: "林澈",
  role: "USER" as const
};

function createPrismaMock() {
  return {
    aiRun: {
      create: vi.fn().mockResolvedValue({ id: "run_1" }),
      update: vi.fn().mockResolvedValue({})
    },
    toolCallRecord: {
      create: vi.fn().mockResolvedValue({})
    }
  };
}

describe("AI orchestrator workflow", () => {
  it("calls the loan status tool and returns a fact-based answer", async () => {
    const prisma = createPrismaMock();
    const tools = {
      execute: vi.fn().mockResolvedValue({
        applicationNo: "LN-20260731-1847",
        amount: "¥8,600.00",
        statusText: "审核中"
      })
    };
    const tickets = { createFromAi: vi.fn() };
    const service = new AiOrchestratorService(prisma as any, tools as any, tickets as any);
    const events: string[] = [];

    const result = await service.run({
      user,
      conversationId: "conv_1",
      content: "帮我查一下借款审核进度",
      history: [{ role: "USER", content: "帮我查一下借款审核进度" }],
      emit: (event) => events.push(event)
    });

    expect(tools.execute).toHaveBeenCalledWith("queryLoanStatus", {
      userId: "user_1",
      conversationId: "conv_1"
    });
    expect(tickets.createFromAi).not.toHaveBeenCalled();
    expect(result.assistantContent).toContain("业务事实");
    expect(events).toContain("tool");
  });

  it("creates a support ticket when intent is unknown", async () => {
    const prisma = createPrismaMock();
    const tools = { execute: vi.fn() };
    const tickets = {
      createFromAi: vi.fn().mockResolvedValue({
        id: "ticket_1",
        ticketNo: "FS-260731-1032",
        status: "PENDING"
      })
    };
    const service = new AiOrchestratorService(prisma as any, tools as any, tickets as any);

    const result = await service.run({
      user,
      conversationId: "conv_1",
      content: "我要转人工",
      history: [{ role: "USER", content: "我要转人工" }],
      emit: vi.fn()
    });

    expect(tools.execute).not.toHaveBeenCalled();
    expect(tickets.createFromAi).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        conversationId: "conv_1",
        category: "unknown"
      })
    );
    expect(result.ticketId).toBe("ticket_1");
  });

  it("uses llm analysis and llm answer when llmConfig is provided", async () => {
    const prisma = createPrismaMock();
    const tools = {
      execute: vi.fn().mockResolvedValue({
        applicationNo: "LN-20260731-1847",
        amount: "¥8,600.00",
        statusText: "审核中"
      })
    };
    const tickets = { createFromAi: vi.fn() };
    const llm = {
      analyzeIntent: vi.fn().mockResolvedValue({
        intent: "loan_status",
        confidence: 0.96,
        needHuman: false,
        reason: "模型识别为借款进度问题"
      }),
      generateAnswer: vi.fn().mockResolvedValue("这是 DeepSeek 生成的回复")
    };
    const service = new AiOrchestratorService(prisma as any, tools as any, tickets as any, llm as any);

    const result = await service.run({
      user,
      conversationId: "conv_1",
      content: "帮我查一下借款审核进度",
      history: [{ role: "USER", content: "帮我查一下借款审核进度" }],
      llmConfig: {
        apiKey: "sk-test",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash"
      },
      emit: vi.fn()
    });

    expect(llm.analyzeIntent).toHaveBeenCalled();
    expect(llm.generateAnswer).toHaveBeenCalled();
    expect(result.assistantContent).toBe("这是 DeepSeek 生成的回复");
  });
});
