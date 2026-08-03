import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PromptVersionStatus, ReviewPriority, ReviewTaskStatus } from "@prisma/client";
import { z } from "zod";
import { analyzeIntent, shouldEscalateIntent } from "../ai/intent";
import { PrismaService } from "../prisma/prisma.service";

const createCaseSchema = z.object({
  name: z.string().trim().min(3).max(120),
  input: z.string().trim().min(2).max(1000),
  expectedIntent: z.string().trim().min(2).max(80),
  expectedTool: z.string().trim().min(2).max(120).nullable().optional(),
  expectedAction: z.enum(["query", "escalate"]),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  enabled: z.boolean().optional()
});

const createPromptSchema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  content: z.string().trim().min(20).max(12000)
});

const reviewDecisionSchema = z.object({
  status: z.enum(["IN_REVIEW", "APPROVED", "REJECTED"]),
  decisionNote: z.string().trim().max(2000).optional()
});

export interface RuntimeEvaluationInput {
  status: string;
  latencyMs: number;
  confidence: number;
  toolCalls: Array<{ status: string; toolName: string }>;
  metadata?: unknown;
}

export function scoreRuntimeEvaluation(input: RuntimeEvaluationInput) {
  const correctnessScore = input.status === "COMPLETED" ? 100 : input.status === "ESCALATED" ? 75 : input.status === "CANCELLED" ? 20 : 0;
  const toolUsageScore = input.toolCalls.length
    ? Math.round(
        input.toolCalls.reduce((sum, call) => {
          if (call.status === "SUCCESS") return sum + 100;
          if (call.status === "EMPTY") return sum + 40;
          if (call.status === "REJECTED") return sum + 20;
          return sum;
        }, 0) / input.toolCalls.length
      )
    : 0;
  const latencyScore = input.latencyMs <= 1500 ? 100 : input.latencyMs <= 3000 ? 85 : input.latencyMs <= 5000 ? 70 : input.latencyMs <= 10000 ? 50 : 20;
  const safetyScore = input.toolCalls.some((call) => call.status === "FAILED") ? 70 : input.toolCalls.some((call) => call.status === "REJECTED") ? 90 : 100;
  const confidenceAdjustment = input.confidence >= 0.8 ? 0 : input.confidence >= 0.6 ? -5 : -10;
  const totalScore = clamp(
    Math.round(correctnessScore * 0.4 + toolUsageScore * 0.3 + latencyScore * 0.15 + safetyScore * 0.15 + confidenceAdjustment)
  );
  const reasons = [
    `run:${input.status}`,
    `tools:${input.toolCalls.map((call) => `${call.toolName}:${call.status}`).join(",") || "none"}`,
    `latency:${input.latencyMs}ms`,
    `confidence:${input.confidence.toFixed(2)}`
  ];
  return {
    correctnessScore,
    toolUsageScore,
    latencyScore,
    safetyScore,
    totalScore,
    passed: totalScore >= 80,
    reasons
  };
}

@Injectable()
export class EvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateAndQueue(aiRunId: string, promptVersionId?: string) {
    const run = await this.prisma.aiRun.findUnique({
      where: { id: aiRunId },
      include: { toolCalls: { select: { status: true, toolName: true } } }
    });
    if (!run) throw new NotFoundException("AI run not found");

    const score = scoreRuntimeEvaluation({
      status: run.status,
      latencyMs: run.latencyMs,
      confidence: Number(run.confidence),
      toolCalls: run.toolCalls,
      metadata: run.metadata
    });
    const evaluation = await this.prisma.agentEvaluation.upsert({
      where: { aiRunId },
      update: {
        promptVersionId,
        correctnessScore: score.correctnessScore,
        toolUsageScore: score.toolUsageScore,
        latencyScore: score.latencyScore,
        safetyScore: score.safetyScore,
        totalScore: score.totalScore,
        passed: score.passed,
        reason: score.reasons
      },
      create: {
        aiRunId,
        promptVersionId,
        correctnessScore: score.correctnessScore,
        toolUsageScore: score.toolUsageScore,
        latencyScore: score.latencyScore,
        safetyScore: score.safetyScore,
        totalScore: score.totalScore,
        passed: score.passed,
        reason: score.reasons
      }
    });

    if (!score.passed || run.status === "ESCALATED" || run.status === "FAILED") {
      await this.prisma.agentReviewTask.upsert({
        where: { aiRunId },
        update: {
          evaluationId: evaluation.id,
          reason: reviewReason(run.status, score.totalScore),
          priority: reviewPriority(score.totalScore)
        },
        create: {
          aiRunId,
          evaluationId: evaluation.id,
          reason: reviewReason(run.status, score.totalScore),
          priority: reviewPriority(score.totalScore)
        }
      });
    }
    return evaluation;
  }

  getActivePrompt(name = "customer-service") {
    return this.prisma.promptVersion.findFirst({
      where: { name, status: PromptVersionStatus.ACTIVE },
      orderBy: { version: "desc" }
    });
  }

  async createPrompt(input: unknown) {
    const parsed = parseOrThrow(createPromptSchema, input);
    const name = parsed.name ?? "customer-service";
    const latest = await this.prisma.promptVersion.findFirst({ where: { name }, orderBy: { version: "desc" } });
    return this.prisma.promptVersion.create({
      data: { name, version: (latest?.version ?? 0) + 1, content: parsed.content }
    });
  }

  listPrompts() {
    return this.prisma.promptVersion.findMany({
      orderBy: [{ name: "asc" }, { version: "desc" }],
      include: { _count: { select: { evaluations: true, caseRuns: true } } }
    });
  }

  async activatePrompt(id: string) {
    const prompt = await this.prisma.promptVersion.findUnique({ where: { id } });
    if (!prompt) throw new NotFoundException("Prompt version not found");
    return this.prisma.$transaction(async (tx) => {
      await tx.promptVersion.updateMany({
        where: { name: prompt.name, status: PromptVersionStatus.ACTIVE, id: { not: id } },
        data: { status: PromptVersionStatus.ARCHIVED }
      });
      return tx.promptVersion.update({
        where: { id },
        data: { status: PromptVersionStatus.ACTIVE, activatedAt: new Date() }
      });
    });
  }

  async createCase(input: unknown) {
    const parsed = parseOrThrow(createCaseSchema, input);
    return this.prisma.evaluationCase.create({
      data: {
        name: parsed.name,
        input: parsed.input,
        expectedIntent: parsed.expectedIntent,
        expectedTool: parsed.expectedTool ?? null,
        expectedAction: parsed.expectedAction,
        tags: parsed.tags ?? [],
        enabled: parsed.enabled ?? true
      }
    });
  }

  listCases() {
    return this.prisma.evaluationCase.findMany({ orderBy: { createdAt: "desc" } });
  }

  async runGoldenSuite() {
    const [cases, prompt] = await Promise.all([
      this.prisma.evaluationCase.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } }),
      this.getActivePrompt()
    ]);
    const results = [];
    for (const item of cases) {
      const intent = analyzeIntent(item.input);
      const actualAction = shouldEscalateIntent(intent) ? "escalate" : "query";
      const actualTool = actualAction === "escalate" ? "createSupportTicket" : intent.intent === "loan_status" ? "queryLoanStatus" : "queryRepaymentRecord";
      const correctnessScore = intent.intent === item.expectedIntent ? 100 : 0;
      const toolUsageScore = actualTool === item.expectedTool ? 100 : 0;
      const actionScore = actualAction === item.expectedAction ? 100 : 0;
      const totalScore = Math.round(correctnessScore * 0.5 + toolUsageScore * 0.3 + actionScore * 0.2);
      results.push(
        await this.prisma.evaluationCaseRun.create({
          data: {
            evaluationCaseId: item.id,
            promptVersionId: prompt?.id,
            actualIntent: intent.intent,
            actualTool,
            correctnessScore,
            toolUsageScore,
            totalScore,
            passed: totalScore >= 80,
            details: { actualAction, expectedAction: item.expectedAction, reason: intent.reason, confidence: intent.confidence }
          },
          include: { evaluationCase: true, promptVersion: true }
        })
      );
    }
    const passed = results.filter((result) => result.passed).length;
    return { total: results.length, passed, passRate: results.length ? Number((passed / results.length).toFixed(4)) : 0, results };
  }

  listReviews(status?: string) {
    const parsedStatus = status && Object.values(ReviewTaskStatus).includes(status as ReviewTaskStatus) ? (status as ReviewTaskStatus) : undefined;
    return this.prisma.agentReviewTask.findMany({
      where: parsedStatus ? { status: parsedStatus } : undefined,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: {
        aiRun: { select: { intent: true, status: true, latencyMs: true, requestId: true, createdAt: true } },
        evaluation: true,
        assignee: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } }
      }
    });
  }

  async updateReview(id: string, reviewerId: string, input: unknown) {
    const parsed = parseOrThrow(reviewDecisionSchema, input);
    const task = await this.prisma.agentReviewTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("Review task not found");
    const isFinal = parsed.status === "APPROVED" || parsed.status === "REJECTED";
    return this.prisma.agentReviewTask.update({
      where: { id },
      data: {
        status: parsed.status,
        assigneeId: task.assigneeId ?? reviewerId,
        reviewerId: isFinal ? reviewerId : task.reviewerId,
        decisionNote: parsed.decisionNote,
        reviewedAt: isFinal ? new Date() : null
      }
    });
  }

  async getDashboard() {
    const [evaluationAggregate, evaluationCount, passedCount, reviewCount, pendingReviewCount, caseRunCount, passedCaseRunCount, prompts, recentEvaluations, recentCaseRuns] =
      await Promise.all([
        this.prisma.agentEvaluation.aggregate({ _avg: { totalScore: true, correctnessScore: true, toolUsageScore: true, safetyScore: true } }),
        this.prisma.agentEvaluation.count(),
        this.prisma.agentEvaluation.count({ where: { passed: true } }),
        this.prisma.agentReviewTask.count(),
        this.prisma.agentReviewTask.count({ where: { status: { in: [ReviewTaskStatus.PENDING, ReviewTaskStatus.IN_REVIEW] } } }),
        this.prisma.evaluationCaseRun.count(),
        this.prisma.evaluationCaseRun.count({ where: { passed: true } }),
        this.listPrompts(),
        this.prisma.agentEvaluation.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { aiRun: { select: { intent: true, status: true, latencyMs: true, requestId: true, createdAt: true } }, promptVersion: true }
        }),
        this.prisma.evaluationCaseRun.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { evaluationCase: true, promptVersion: true }
        })
      ]);
    return {
      metrics: {
        evaluationCount,
        passRate: ratio(passedCount, evaluationCount),
        averageScore: Math.round(evaluationAggregate._avg.totalScore ?? 0),
        averageCorrectness: Math.round(evaluationAggregate._avg.correctnessScore ?? 0),
        averageToolUsage: Math.round(evaluationAggregate._avg.toolUsageScore ?? 0),
        averageSafety: Math.round(evaluationAggregate._avg.safetyScore ?? 0),
        reviewCount,
        pendingReviewCount,
        caseRunCount,
        regressionPassRate: ratio(passedCaseRunCount, caseRunCount)
      },
      prompts,
      recentEvaluations,
      recentCaseRuns
    };
  }
}

function reviewPriority(score: number) {
  return score < 50 ? ReviewPriority.HIGH : score < 75 ? ReviewPriority.MEDIUM : ReviewPriority.LOW;
}

function reviewReason(status: string, score: number) {
  return status === "ESCALATED" ? `Agent 已转人工，质量评分 ${score}` : `Agent 质量评分 ${score}，低于通过阈值 80`;
}

function parseOrThrow<T>(schema: z.ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}

function ratio(value: number, total: number) {
  return total ? Number((value / total).toFixed(4)) : 0;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
