import { Injectable } from "@nestjs/common";
import { IntentResult, LlmConfig } from "@finserve/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { RequestUser } from "../common/current-user.decorator";
import { TicketsService } from "../tickets/tickets.service";
import { analyzeIntent, shouldEscalateIntent } from "./intent";
import { LlmGatewayService } from "./llm-gateway.service";
import { ToolName, ToolRegistryService } from "./tool-registry.service";

type Emit = (event: "status" | "tool" | "message" | "done" | "error", data: unknown) => void;

export interface AiTurnResult {
  assistantContent: string;
  ticketId?: string;
}

@Injectable()
export class AiOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: ToolRegistryService,
    private readonly tickets: TicketsService,
    private readonly llm?: LlmGatewayService
  ) {}

  async run(params: {
    user: RequestUser;
    conversationId: string;
    content: string;
    history: Array<{ role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL"; content: string }>;
    llmConfig?: LlmConfig;
    emit: Emit;
  }): Promise<AiTurnResult> {
    const startedAt = Date.now();
    params.emit("status", { stage: "analyzing_intent", label: "正在识别问题" });

    const intent = await this.resolveIntent(params.content, params.history, params.llmConfig);
    const aiRun = await this.prisma.aiRun.create({
      data: {
        conversationId: params.conversationId,
        intent: intent.intent,
        confidence: intent.confidence,
        status: "RUNNING",
        metadata: { reason: intent.reason }
      }
    });

    if (shouldEscalateIntent(intent)) {
      return this.escalate({
        user: params.user,
        conversationId: params.conversationId,
        aiRunId: aiRun.id,
        intent,
        reason: intent.reason,
        emit: params.emit,
        startedAt
      });
    }

    const toolName = this.pickTool(intent);
    params.emit("status", { stage: "calling_tool", label: this.toolStageLabel(toolName) });

    const toolStartedAt = Date.now();
    try {
      const toolOutput = await this.tools.execute(toolName, {
        userId: params.user.id,
        conversationId: params.conversationId
      });
      await this.prisma.toolCallRecord.create({
        data: {
          aiRunId: aiRun.id,
          toolName,
          input: { userId: params.user.id },
          output: toolOutput ?? { result: null },
          status: toolOutput ? "SUCCESS" : "EMPTY",
          latencyMs: Date.now() - toolStartedAt
        }
      });

      params.emit("tool", {
        name: toolName,
        status: toolOutput ? "SUCCESS" : "EMPTY",
        output: toolOutput
      });

      if (!toolOutput) {
        return this.escalate({
          user: params.user,
          conversationId: params.conversationId,
          aiRunId: aiRun.id,
          intent,
          reason: "工具没有返回可靠业务事实",
          emit: params.emit,
          startedAt
        });
      }

      params.emit("status", { stage: "generating_answer", label: "正在生成可追溯回复" });
      const answer = await this.generateAnswer({
        content: params.content,
        history: params.history,
        intent,
        toolOutput,
        llmConfig: params.llmConfig
      });
      await this.prisma.aiRun.update({
        where: { id: aiRun.id },
        data: {
          status: "COMPLETED",
          latencyMs: Date.now() - startedAt,
          metadata: { reason: intent.reason, toolName }
        }
      });
      return { assistantContent: answer };
    } catch (error) {
      await this.prisma.toolCallRecord.create({
        data: {
          aiRunId: aiRun.id,
          toolName,
          input: { userId: params.user.id },
          output: { message: error instanceof Error ? error.message : "unknown error" },
          status: "FAILED",
          latencyMs: Date.now() - toolStartedAt
        }
      });
      params.emit("tool", { name: toolName, status: "FAILED" });
      return this.escalate({
        user: params.user,
        conversationId: params.conversationId,
        aiRunId: aiRun.id,
        intent,
        reason: "业务工具调用失败",
        emit: params.emit,
        startedAt
      });
    }
  }

  private async escalate(params: {
    user: RequestUser;
    conversationId: string;
    aiRunId: string;
    intent: IntentResult;
    reason: string;
    emit: Emit;
    startedAt: number;
  }) {
    params.emit("status", { stage: "creating_ticket", label: "正在转人工并创建工单" });
    const ticket = await this.tickets.createFromAi({
      userId: params.user.id,
      conversationId: params.conversationId,
      aiRunId: params.aiRunId,
      category: params.intent.intent,
      reason: params.reason,
      priority: params.intent.intent === "unknown" ? "HIGH" : "MEDIUM"
    });

    await this.prisma.toolCallRecord.create({
      data: {
        aiRunId: params.aiRunId,
        toolName: "createSupportTicket",
        input: {
          category: params.intent.intent,
          reason: params.reason
        },
        output: {
          ticketId: ticket.id,
          ticketNo: ticket.ticketNo,
          status: ticket.status
        },
        status: "SUCCESS",
        latencyMs: Date.now() - params.startedAt
      }
    });
    params.emit("tool", {
      name: "createSupportTicket",
      status: "SUCCESS",
      output: { ticketNo: ticket.ticketNo, status: ticket.status }
    });

    return {
      assistantContent: `我无法基于当前信息给出确定结论，已为你转人工处理。工单号：${ticket.ticketNo}。`,
      ticketId: ticket.id
    };
  }

  private pickTool(intent: IntentResult): ToolName {
    return intent.intent === "loan_status" ? "queryLoanStatus" : "queryRepaymentRecord";
  }

  private toolStageLabel(toolName: ToolName) {
    return toolName === "queryLoanStatus" ? "正在查询借款状态" : "正在查询还款记录";
  }

  private async resolveIntent(
    content: string,
    history: Array<{ role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL"; content: string }>,
    llmConfig?: LlmConfig
  ) {
    if (llmConfig?.apiKey && this.llm) {
      try {
        return await this.llm.analyzeIntent({ content, history, llmConfig });
      } catch {
        return analyzeIntent(content);
      }
    }
    return analyzeIntent(content);
  }

  private async generateAnswer(params: {
    content: string;
    history: Array<{ role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL"; content: string }>;
    intent: IntentResult;
    toolOutput: Record<string, unknown>;
    llmConfig?: LlmConfig;
  }) {
    if (params.llmConfig?.apiKey && this.llm) {
      try {
        return await this.llm.generateAnswer({
          content: params.content,
          history: params.history,
          intent: params.intent,
          toolOutput: params.toolOutput,
          llmConfig: params.llmConfig
        });
      } catch {
        return this.generateFallbackAnswer(params.intent, params.toolOutput);
      }
    }
    return this.generateFallbackAnswer(params.intent, params.toolOutput);
  }

  private generateFallbackAnswer(intent: IntentResult, toolOutput: Record<string, unknown>) {
    if (intent.intent === "loan_status") {
      return [
        `业务事实：你的借款申请 ${toolOutput.applicationNo} 当前状态为「${toolOutput.statusText}」，申请金额 ${toolOutput.amount}。`,
        "处理建议：审核中通常无需重复提交申请，请等待系统或人工审核结果。",
        "风险提示：我只基于业务工具返回的状态回答，不会承诺放款时间。"
      ].join("\n");
    }

    return [
      `业务事实：最近一笔还款记录 ${toolOutput.recordNo} 当前为「${toolOutput.statusText}」，金额 ${toolOutput.amount}。`,
      `处理建议：失败原因是「${toolOutput.failedReason ?? "暂未返回明确原因"}」，可更换银行卡或降低单笔金额后重试。`,
      "风险提示：涉及扣款与账户安全的问题，如仍无法处理请转人工确认。"
    ].join("\n");
  }
}
