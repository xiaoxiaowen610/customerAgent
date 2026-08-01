import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface ToolContext {
  userId: string;
  conversationId: string;
}

export type ToolName = "queryLoanStatus" | "queryRepaymentRecord";

@Injectable()
export class ToolRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async execute(name: ToolName, context: ToolContext) {
    if (name === "queryLoanStatus") {
      return this.queryLoanStatus(context.userId);
    }
    if (name === "queryRepaymentRecord") {
      return this.queryRepaymentRecord(context.userId);
    }
    throw new Error(`Tool ${name} is not registered`);
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

function formatCents(value: number) {
  return `¥${(value / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
