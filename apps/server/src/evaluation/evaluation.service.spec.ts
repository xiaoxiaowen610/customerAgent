import { describe, expect, it, vi } from "vitest";
import { EvaluationService, scoreRuntimeEvaluation } from "./evaluation.service";

describe("scoreRuntimeEvaluation", () => {
  it("passes a fast completed run with a successful tool", () => {
    const score = scoreRuntimeEvaluation({
      status: "COMPLETED",
      latencyMs: 900,
      confidence: 0.92,
      toolCalls: [{ status: "SUCCESS", toolName: "queryLoanStatus" }]
    });
    expect(score).toMatchObject({
      correctnessScore: 100,
      toolUsageScore: 100,
      latencyScore: 100,
      safetyScore: 100,
      totalScore: 100,
      passed: true
    });
  });

  it("fails an unsuccessful run and keeps scores bounded", () => {
    const score = scoreRuntimeEvaluation({
      status: "FAILED",
      latencyMs: 20_000,
      confidence: 0.2,
      toolCalls: [{ status: "FAILED", toolName: "queryRepaymentRecord" }]
    });
    expect(score.passed).toBe(false);
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.totalScore).toBeLessThan(50);
  });
});

describe("EvaluationService", () => {
  it("persists evaluation and queues low-quality runs", async () => {
    const prisma = {
      aiRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: "run_1",
          status: "FAILED",
          latencyMs: 12_000,
          confidence: 0.4,
          metadata: {},
          toolCalls: [{ status: "FAILED", toolName: "queryLoanStatus" }]
        })
      },
      agentEvaluation: {
        upsert: vi.fn().mockResolvedValue({ id: "evaluation_1", totalScore: 5, passed: false })
      },
      agentReviewTask: {
        upsert: vi.fn().mockResolvedValue({ id: "review_1" })
      }
    };
    const service = new EvaluationService(prisma as any);

    const result = await service.evaluateAndQueue("run_1");

    expect(result.id).toBe("evaluation_1");
    expect(prisma.agentEvaluation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ aiRunId: "run_1", passed: false }) })
    );
    expect(prisma.agentReviewTask.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ aiRunId: "run_1", priority: "HIGH" }) })
    );
  });

  it("always queues escalated runs even when the heuristic score passes", async () => {
    const prisma = {
      aiRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: "run_2",
          status: "ESCALATED",
          latencyMs: 1000,
          confidence: 0.9,
          metadata: {},
          toolCalls: [{ status: "SUCCESS", toolName: "createSupportTicket" }]
        })
      },
      agentEvaluation: {
        upsert: vi.fn().mockResolvedValue({ id: "evaluation_2", totalScore: 90, passed: true })
      },
      agentReviewTask: { upsert: vi.fn().mockResolvedValue({ id: "review_2" }) }
    };
    const service = new EvaluationService(prisma as any);

    await service.evaluateAndQueue("run_2");

    expect(prisma.agentReviewTask.upsert).toHaveBeenCalled();
  });

  it("runs deterministic golden cases and records regression results", async () => {
    const cases = [
      {
        id: "case_1",
        name: "loan-status-routing",
        input: "帮我查贷款审核进度",
        expectedIntent: "loan_status",
        expectedTool: "queryLoanStatus",
        expectedAction: "query"
      },
      {
        id: "case_2",
        name: "human-transfer",
        input: "我要投诉并转人工",
        expectedIntent: "unknown",
        expectedTool: "createSupportTicket",
        expectedAction: "escalate"
      }
    ];
    const prisma = {
      evaluationCase: { findMany: vi.fn().mockResolvedValue(cases) },
      promptVersion: { findFirst: vi.fn().mockResolvedValue({ id: "prompt_1" }) },
      evaluationCaseRun: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: `run_${data.evaluationCaseId}`, ...data }))
      }
    };
    const service = new EvaluationService(prisma as any);

    const result = await service.runGoldenSuite();

    expect(result).toMatchObject({ total: 2, passed: 2, passRate: 1 });
    expect(prisma.evaluationCaseRun.create).toHaveBeenCalledTimes(2);
  });
});
