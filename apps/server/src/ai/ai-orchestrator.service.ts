import { Injectable, Optional } from "@nestjs/common";
import { IntentResult } from "@finserve/shared-types";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RequestUser } from "../common/current-user.decorator";
import { EvaluationService } from "../evaluation/evaluation.service";
import { analyzeIntent, shouldEscalateIntent } from "./intent";
import { LlmGatewayService, PlannedToolCall } from "./llm-gateway.service";
import { ToolName, ToolRegistryService, ToolRuntimeError } from "./tool-registry.service";

type Emit = (event: "status" | "tool" | "message" | "done" | "error", data: unknown) => void;
type HistoryMessage = { role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL"; content: string };

export interface AiTurnResult {
  assistantContent: string;
  ticketId?: string;
}

@Injectable()
export class AiOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: ToolRegistryService,
    private readonly llm: LlmGatewayService,
    @Optional() private readonly evaluation?: EvaluationService
  ) {}

  async run(params: {
    user: RequestUser;
    conversationId: string;
    content: string;
    requestId?: string;
    history: HistoryMessage[];
    emit: Emit;
    signal?: AbortSignal;
  }): Promise<AiTurnResult> {
    if (this.llm.isConfigured()) {
      return this.runWithLlm(params);
    }
    return this.runDeterministic(params);
  }

  private async runWithLlm(params: {
    user: RequestUser;
    conversationId: string;
    content: string;
    requestId?: string;
    history: HistoryMessage[];
    emit: Emit;
    signal?: AbortSignal;
  }): Promise<AiTurnResult> {
    const startedAt = Date.now();
    params.emit("status", { stage: "planning_tool", label: "正在规划受控工具调用" });
    const aiRun = await this.prisma.aiRun.create({
      data: {
        conversationId: params.conversationId,
        requestId: params.requestId,
        intent: "tool_call_pending",
        confidence: 1,
        status: "RUNNING",
        metadata: { mode: "llm_tool_call" }
      }
    });

    let plannedCall: PlannedToolCall | undefined;
    let phase: "planning" | "executing" | "streaming" = "planning";
    try {
      plannedCall = await this.llm.requestToolCall({
        content: params.content,
        history: params.history,
        tools: this.tools.getDefinitions(),
        signal: params.signal
      });
      const parsedCall = this.tools.parseCall(plannedCall);
      phase = "executing";
      await this.prisma.aiRun.update({
        where: { id: aiRun.id },
        data: {
          intent: parsedCall.name,
          metadata: {
            mode: "llm_tool_call",
            toolName: parsedCall.name,
            ...(plannedCall.promptVersionId ? { promptVersionId: plannedCall.promptVersionId } : {})
          }
        }
      });

      params.emit("status", { stage: "calling_tool", label: toolStageLabel(parsedCall.name) });
      const toolOutput = await this.executeAndRecord({
        aiRunId: aiRun.id,
        name: parsedCall.name,
        input: parsedCall.input,
        user: params.user,
        conversationId: params.conversationId,
        requestId: params.requestId,
        emit: params.emit,
        signal: params.signal
      });

      if (parsedCall.name === "createSupportTicket") {
        const result = escalationResult(toolOutput);
        await this.prisma.aiRun.update({
          where: { id: aiRun.id },
          data: { status: "ESCALATED", latencyMs: Date.now() - startedAt }
        });
        await this.evaluateSafely(aiRun.id, plannedCall.promptVersionId);
        emitDemoText(result.assistantContent, params.emit);
        return result;
      }
      if (!toolOutput) {
        return this.escalate({
          ...params,
          aiRunId: aiRun.id,
          reason: "业务工具没有返回可靠事实",
          category: parsedCall.name === "queryLoanStatus" ? "loan_status" : "repayment_failed",
          startedAt,
          promptVersionId: plannedCall.promptVersionId
        });
      }

      params.emit("status", { stage: "generating_answer", label: "正在基于工具事实生成回复" });
      phase = "streaming";
      const answer = await this.llm.streamAnswer({
        content: params.content,
        history: params.history,
        toolCall: plannedCall,
        toolOutput,
        signal: params.signal,
        onDelta: (delta) => params.emit("message", { delta })
      });
      await this.prisma.aiRun.update({
        where: { id: aiRun.id },
        data: { status: "COMPLETED", latencyMs: Date.now() - startedAt }
      });
      await this.evaluateSafely(aiRun.id, plannedCall.promptVersionId);
      return { assistantContent: answer };
    } catch (error) {
      if (params.signal?.aborted || isAbortError(error)) {
        await this.prisma.aiRun.update({
          where: { id: aiRun.id },
          data: { status: "CANCELLED", latencyMs: Date.now() - startedAt }
        });
        await this.evaluateSafely(aiRun.id, plannedCall?.promptVersionId);
        throw error;
      }

      if (phase === "planning") {
        await this.recordPlanningFailure(aiRun.id, plannedCall, error, startedAt, params.requestId);
      } else {
        await this.prisma.aiRun.update({
          where: { id: aiRun.id },
          data: {
            status: "FAILED",
            latencyMs: Date.now() - startedAt,
            metadata: { mode: "llm_tool_call", phase, code: runtimeCode(error) }
          }
        });
      }
      return this.escalate({
        ...params,
        aiRunId: aiRun.id,
        reason: safeRuntimeReason(error),
        category: "unknown",
        startedAt,
        promptVersionId: plannedCall?.promptVersionId
      });
    }
  }

  private async runDeterministic(params: {
    user: RequestUser;
    conversationId: string;
    content: string;
    requestId?: string;
    history: HistoryMessage[];
    emit: Emit;
    signal?: AbortSignal;
  }): Promise<AiTurnResult> {
    const startedAt = Date.now();
    params.emit("status", { stage: "analyzing_intent", label: "正在使用确定性规则识别问题" });
    const intent = analyzeIntent(params.content);
    const aiRun = await this.prisma.aiRun.create({
      data: {
        conversationId: params.conversationId,
        requestId: params.requestId,
        intent: intent.intent,
        confidence: intent.confidence,
        status: "RUNNING",
        metadata: { mode: "deterministic", reason: intent.reason }
      }
    });

    if (shouldEscalateIntent(intent)) {
      return this.escalate({
        ...params,
        aiRunId: aiRun.id,
        reason: intent.reason,
        category: intent.intent,
        startedAt
      });
    }

    const toolName: ToolName = intent.intent === "loan_status" ? "queryLoanStatus" : "queryRepaymentRecord";
    params.emit("status", { stage: "calling_tool", label: toolStageLabel(toolName) });
    try {
      const toolOutput = await this.executeAndRecord({
        aiRunId: aiRun.id,
        name: toolName,
        input: {},
        user: params.user,
        conversationId: params.conversationId,
        requestId: params.requestId,
        emit: params.emit,
        signal: params.signal
      });
      if (!toolOutput) {
        return this.escalate({
          ...params,
          aiRunId: aiRun.id,
          reason: "业务工具没有返回可靠事实",
          category: intent.intent,
          startedAt
        });
      }

      const answer = generateFallbackAnswer(intent, toolOutput);
      params.emit("status", { stage: "generating_answer", label: "正在生成演示回复" });
      emitDemoText(answer, params.emit);
      await this.prisma.aiRun.update({
        where: { id: aiRun.id },
        data: { status: "COMPLETED", latencyMs: Date.now() - startedAt }
      });
      await this.evaluateSafely(aiRun.id);
      return { assistantContent: answer };
    } catch (error) {
      if (params.signal?.aborted || isAbortError(error)) {
        await this.prisma.aiRun.update({
          where: { id: aiRun.id },
          data: { status: "CANCELLED", latencyMs: Date.now() - startedAt }
        });
        await this.evaluateSafely(aiRun.id);
        throw error;
      }
      return this.escalate({
        ...params,
        aiRunId: aiRun.id,
        reason: "业务工具调用失败",
        category: intent.intent,
        startedAt
      });
    }
  }

  private async executeAndRecord(params: {
    aiRunId: string;
    name: ToolName;
    input: Record<string, unknown>;
    user: RequestUser;
    conversationId: string;
    requestId?: string;
    emit: Emit;
    signal?: AbortSignal;
  }): Promise<Record<string, unknown> | null> {
    const startedAt = Date.now();
    try {
      const output = await this.tools.execute(params.name, params.input, {
        userId: params.user.id,
        conversationId: params.conversationId,
        aiRunId: params.aiRunId,
        requestId: params.requestId,
        signal: params.signal
      });
      await this.prisma.toolCallRecord.create({
        data: {
          aiRunId: params.aiRunId,
          requestId: params.requestId,
          toolName: params.name,
          input: params.input as Prisma.InputJsonValue,
          output: (output ?? { result: null }) as Prisma.InputJsonValue,
          status: output ? "SUCCESS" : "EMPTY",
          latencyMs: Date.now() - startedAt
        }
      });
      params.emit("tool", { name: params.name, status: output ? "SUCCESS" : "EMPTY", output });
      return output;
    } catch (error) {
      await this.prisma.toolCallRecord.create({
        data: {
          aiRunId: params.aiRunId,
          requestId: params.requestId,
          toolName: params.name,
          input: params.input as Prisma.InputJsonValue,
          output: { code: runtimeCode(error), message: safeRuntimeReason(error) },
          status: "FAILED",
          latencyMs: Date.now() - startedAt
        }
      });
      params.emit("tool", { name: params.name, status: "FAILED", code: runtimeCode(error) });
      throw error;
    }
  }

  private async escalate(params: {
    user: RequestUser;
    conversationId: string;
    content: string;
    requestId?: string;
    history: HistoryMessage[];
    emit: Emit;
    signal?: AbortSignal;
    aiRunId: string;
    reason: string;
    category: IntentResult["intent"];
    startedAt: number;
    promptVersionId?: string;
  }) {
    params.emit("status", { stage: "creating_ticket", label: "正在安全转人工" });
    const output = await this.executeAndRecord({
      aiRunId: params.aiRunId,
      name: "createSupportTicket",
      input: { category: params.category, reason: params.reason },
      user: params.user,
      conversationId: params.conversationId,
      requestId: params.requestId,
      emit: params.emit,
      signal: params.signal
    });
    const result = escalationResult(output);
    await this.prisma.aiRun.update({
      where: { id: params.aiRunId },
      data: { status: "ESCALATED", latencyMs: Date.now() - params.startedAt }
    });
    await this.evaluateSafely(params.aiRunId, params.promptVersionId);
    emitDemoText(result.assistantContent, params.emit);
    return result;
  }

  private async evaluateSafely(aiRunId: string, promptVersionId?: string) {
    try {
      await this.evaluation?.evaluateAndQueue(aiRunId, promptVersionId);
    } catch {
      // Evaluation is an observability side effect and must not break the customer response path.
    }
  }

  private async recordPlanningFailure(
    aiRunId: string,
    call: PlannedToolCall | undefined,
    error: unknown,
    startedAt: number,
    requestId?: string
  ) {
    await this.prisma.aiRun.update({
      where: { id: aiRunId },
      data: {
        status: "FAILED",
        latencyMs: Date.now() - startedAt,
        metadata: { mode: "llm_tool_call", code: runtimeCode(error) }
      }
    });
    if (call) {
      await this.prisma.toolCallRecord.create({
        data: {
          aiRunId,
          requestId,
          toolName: call.name,
          input: { rawArguments: call.arguments },
          output: { code: runtimeCode(error), message: safeRuntimeReason(error) },
          status: "REJECTED",
          latencyMs: Date.now() - startedAt
        }
      });
    }
  }
}

function toolStageLabel(toolName: ToolName) {
  if (toolName === "queryLoanStatus") return "正在查询借款状态";
  if (toolName === "queryRepaymentRecord") return "正在查询还款记录";
  return "正在创建人工工单";
}

function escalationResult(output: Record<string, unknown> | null): AiTurnResult {
  if (!output?.ticketId || !output.ticketNo) {
    throw new ToolRuntimeError("TICKET_OUTPUT_INVALID", "Support ticket tool returned invalid output");
  }
  return {
    assistantContent: `我无法基于当前信息给出确定结论，已为你转人工处理。工单号：${String(output.ticketNo)}。`,
    ticketId: String(output.ticketId)
  };
}

function generateFallbackAnswer(intent: IntentResult, toolOutput: Record<string, unknown>) {
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

function emitDemoText(text: string, emit: Emit) {
  for (let index = 0; index < text.length; index += 18) {
    emit("message", { delta: text.slice(index, index + 18) });
  }
}

function runtimeCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "RUNTIME_FAILED";
}

function safeRuntimeReason(error: unknown) {
  const code = runtimeCode(error);
  const messages: Record<string, string> = {
    TOOL_NOT_REGISTERED: "模型请求了未注册工具",
    TOOL_ARGUMENTS_INVALID_JSON: "模型返回的工具参数不是合法 JSON",
    TOOL_ARGUMENTS_INVALID: "模型返回的工具参数未通过校验",
    TOOL_STEP_LIMIT_EXCEEDED: "模型工具调用超过单轮限制",
    MODEL_DID_NOT_CALL_TOOL: "模型未按策略调用工具",
    LLM_REQUEST_FAILED: "模型规划请求失败",
    LLM_STREAM_FAILED: "模型流式回复失败",
    LLM_TIMEOUT: "模型请求超时",
    LLM_EMPTY_ANSWER: "模型未返回有效回复"
  };
  return messages[code] ?? "Agent 运行时未能获得可靠结果";
}

function isAbortError(error: unknown) {
  const code = runtimeCode(error);
  return code === "LLM_ABORTED" || code === "TOOL_ABORTED" || (error instanceof Error && error.name === "AbortError");
}
