import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { TicketsService } from "../tickets/tickets.service";

const QueryInputSchema = z.object({}).strict();
const EscalationInputSchema = z
  .object({
    category: z.enum(["loan_status", "repayment_failed", "unknown"]).default("unknown"),
    reason: z.string().trim().min(1).max(500)
  })
  .strict();

export type ToolName = "queryLoanStatus" | "queryRepaymentRecord" | "createSupportTicket";

export interface ToolContext {
  userId: string;
  conversationId: string;
  aiRunId: string;
  requestId?: string;
  signal?: AbortSignal;
}

export interface ToolCallInput {
  name: string;
  arguments: string;
}

export interface RegisteredToolDefinition {
  name: ToolName;
  description: string;
  parameters: Record<string, unknown>;
}

const definitions: RegisteredToolDefinition[] = [
  {
    name: "queryLoanStatus",
    description: "查询当前登录用户最近一笔借款申请的审核状态，只读工具。",
    parameters: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "queryRepaymentRecord",
    description: "查询当前登录用户最近一笔还款记录和失败原因，只读工具。",
    parameters: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "createSupportTicket",
    description: "当用户明确要求人工、问题超出支持范围或无法获得可靠事实时创建人工客服工单。",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["loan_status", "repayment_failed", "unknown"]
        },
        reason: { type: "string", minLength: 1, maxLength: 500 }
      },
      required: ["category", "reason"],
      additionalProperties: false
    }
  }
];

@Injectable()
export class ToolRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService
  ) {}

  getDefinitions() {
    return definitions;
  }

  parseCall(call: ToolCallInput): { name: ToolName; input: Record<string, unknown> } {
    if (!isToolName(call.name)) {
      throw new ToolRuntimeError("TOOL_NOT_REGISTERED", `Tool ${call.name} is not registered`);
    }

    let input: unknown;
    try {
      input = call.arguments.trim() ? JSON.parse(call.arguments) : {};
    } catch {
      throw new ToolRuntimeError("TOOL_ARGUMENTS_INVALID_JSON", "Tool arguments are not valid JSON");
    }

    const schema = call.name === "createSupportTicket" ? EscalationInputSchema : QueryInputSchema;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      throw new ToolRuntimeError("TOOL_ARGUMENTS_INVALID", parsed.error.issues.map((issue) => issue.message).join("; "));
    }

    return { name: call.name, input: parsed.data };
  }

  async execute(name: ToolName, input: Record<string, unknown>, context: ToolContext) {
    throwIfAborted(context.signal);
    return withTimeout(this.executeInternal(name, input, context), 8_000, context.signal);
  }

  private async executeInternal(name: ToolName, input: Record<string, unknown>, context: ToolContext) {
    if (name === "queryLoanStatus") {
      return this.queryLoanStatus(context.userId);
    }
    if (name === "queryRepaymentRecord") {
      return this.queryRepaymentRecord(context.userId);
    }

    const escalation = EscalationInputSchema.parse(input);
    const ticket = await this.tickets.createFromAi({
      userId: context.userId,
      conversationId: context.conversationId,
      aiRunId: context.aiRunId,
      requestId: context.requestId,
      category: escalation.category,
      reason: escalation.reason,
      priority: escalation.category === "unknown" ? "HIGH" : "MEDIUM"
    });
    return {
      ticketId: ticket.id,
      ticketNo: ticket.ticketNo,
      status: ticket.status
    };
  }

  private async queryLoanStatus(userId: string) {
    const loan = await this.prisma.loanApplication.findFirst({
      where: { userId },
      orderBy: { submittedAt: "desc" }
    });
    if (!loan) {
      return null;
    }
    return {
      applicationNo: loan.applicationNo,
      amount: formatCents(loan.amountCents),
      status: loan.status,
      statusText: loan.status === "UNDER_REVIEW" ? "审核中" : loan.status,
      submittedAt: loan.submittedAt.toISOString()
    };
  }

  private async queryRepaymentRecord(userId: string) {
    const record = await this.prisma.repaymentRecord.findFirst({
      where: { userId },
      orderBy: { dueDate: "desc" }
    });
    if (!record) {
      return null;
    }
    return {
      recordNo: record.recordNo,
      amount: formatCents(record.amountCents),
      status: record.status,
      statusText: record.status === "FAILED" ? "失败" : record.status,
      failedReason: record.failedReason,
      dueDate: record.dueDate.toISOString()
    };
  }
}

export class ToolRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ToolRuntimeError";
  }
}

function isToolName(value: string): value is ToolName {
  return definitions.some((definition) => definition.name === value);
}

function formatCents(value: number) {
  return `¥${(value / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new ToolRuntimeError("TOOL_ABORTED", "Tool execution was aborted");
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ToolRuntimeError("TOOL_TIMEOUT", "Tool execution timed out")), timeoutMs);
    const onAbort = () => reject(new ToolRuntimeError("TOOL_ABORTED", "Tool execution was aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });

    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    });
  });
}
