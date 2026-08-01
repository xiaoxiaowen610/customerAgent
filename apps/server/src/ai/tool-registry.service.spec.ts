import { describe, expect, it, vi } from "vitest";
import { ToolRegistryService } from "./tool-registry.service";

function service() {
  const prisma = {
    loanApplication: { findFirst: vi.fn() },
    repaymentRecord: { findFirst: vi.fn() }
  };
  const tickets = { createFromAi: vi.fn() };
  return { registry: new ToolRegistryService(prisma as any, tickets as any), prisma, tickets };
}

describe("Tool Registry", () => {
  it("rejects tools outside the whitelist", () => {
    const { registry } = service();
    expect(() => registry.parseCall({ name: "runSql", arguments: "{}" })).toThrow("not registered");
  });

  it("rejects malformed JSON arguments", () => {
    const { registry } = service();
    expect(() => registry.parseCall({ name: "queryLoanStatus", arguments: "{" })).toThrow("not valid JSON");
  });

  it("rejects unexpected query parameters", () => {
    const { registry } = service();
    expect(() => registry.parseCall({ name: "queryLoanStatus", arguments: '{"userId":"other"}' })).toThrow();
  });

  it("uses server context instead of model-provided identity", async () => {
    const { registry, prisma } = service();
    prisma.loanApplication.findFirst.mockResolvedValue({
      applicationNo: "LN-1",
      amountCents: 10000,
      status: "UNDER_REVIEW",
      submittedAt: new Date("2026-08-01T00:00:00Z")
    });
    const output = await registry.execute("queryLoanStatus", {}, {
      userId: "user_1",
      conversationId: "conv_1",
      aiRunId: "run_1"
    });
    expect(prisma.loanApplication.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user_1" } }));
    expect(output).toMatchObject({ applicationNo: "LN-1", statusText: "审核中" });
  });

  it("aborts before executing a tool", async () => {
    const { registry, prisma } = service();
    const controller = new AbortController();
    controller.abort();
    await expect(
      registry.execute("queryLoanStatus", {}, {
        userId: "user_1",
        conversationId: "conv_1",
        aiRunId: "run_1",
        signal: controller.signal
      })
    ).rejects.toMatchObject({ code: "TOOL_ABORTED" });
    expect(prisma.loanApplication.findFirst).not.toHaveBeenCalled();
  });

  it("creates support tickets through the same validated registry", async () => {
    const { registry, tickets } = service();
    tickets.createFromAi.mockResolvedValue({ id: "ticket_1", ticketNo: "FS-1", status: "PENDING" });
    const parsed = registry.parseCall({
      name: "createSupportTicket",
      arguments: '{"category":"unknown","reason":"用户要求人工"}'
    });
    const output = await registry.execute(parsed.name, parsed.input, {
      userId: "user_1",
      conversationId: "conv_1",
      aiRunId: "run_1"
    });
    expect(tickets.createFromAi).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        conversationId: "conv_1",
        aiRunId: "run_1",
        reason: "用户要求人工"
      })
    );
    expect(output).toEqual({ ticketId: "ticket_1", ticketNo: "FS-1", status: "PENDING" });
  });
});
