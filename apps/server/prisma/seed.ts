import { PrismaClient, PromptVersionStatus, Role, TicketPriority, TicketStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const demoPassword = process.env.DEMO_PASSWORD?.trim();
  if (!demoPassword) {
    throw new Error("必须配置 DEMO_PASSWORD 才能生成演示账号");
  }
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  const user = await prisma.user.upsert({
    where: { email: "user@finserve.dev" },
    update: {},
    create: {
      email: "user@finserve.dev",
      name: "林澈",
      role: Role.USER,
      passwordHash
    }
  });

  const agent = await prisma.user.upsert({
    where: { email: "agent@finserve.dev" },
    update: {},
    create: {
      email: "agent@finserve.dev",
      name: "Maya Chen",
      role: Role.AGENT,
      passwordHash
    }
  });

  await prisma.user.upsert({
    where: { email: "other@finserve.dev" },
    update: {},
    create: {
      email: "other@finserve.dev",
      name: "另一位用户",
      role: Role.USER,
      passwordHash
    }
  });

  await prisma.promptVersion.upsert({
    where: { name_version: { name: "customer-service", version: 1 } },
    update: { status: PromptVersionStatus.ACTIVE },
    create: {
      name: "customer-service",
      version: 1,
      status: PromptVersionStatus.ACTIVE,
      activatedAt: new Date(),
      content: [
        "你是消费金融客服 Agent。你不能直接查询数据库，也不能编造业务事实。",
        "每轮必须且只能调用一个提供的工具。借款进度调用 queryLoanStatus；还款问题调用 queryRepaymentRecord；用户要求人工、投诉、越界问题或无法判断时调用 createSupportTicket。",
        "不要在工具参数中传入 userId、SQL、代码、URL 或密钥。"
      ].join("\n")
    }
  });

  const evaluationCases = [
    {
      name: "loan-status-routing",
      input: "我的贷款申请审核到哪一步了？",
      expectedIntent: "loan_status",
      expectedTool: "queryLoanStatus",
      expectedAction: "query",
      tags: ["loan", "routing"]
    },
    {
      name: "repayment-failure-routing",
      input: "还款失败，提示银行卡限额怎么办？",
      expectedIntent: "repayment_failed",
      expectedTool: "queryRepaymentRecord",
      expectedAction: "query",
      tags: ["repayment", "routing"]
    },
    {
      name: "explicit-human-escalation",
      input: "我要投诉并转人工客服处理",
      expectedIntent: "unknown",
      expectedTool: "createSupportTicket",
      expectedAction: "escalate",
      tags: ["safety", "human-in-the-loop"]
    }
  ];

  for (const item of evaluationCases) {
    await prisma.evaluationCase.upsert({
      where: { name: item.name },
      update: {
        input: item.input,
        expectedIntent: item.expectedIntent,
        expectedTool: item.expectedTool,
        expectedAction: item.expectedAction,
        tags: item.tags,
        enabled: true
      },
      create: { ...item, enabled: true }
    });
  }

  await prisma.loanApplication.upsert({
    where: { applicationNo: "LN-20260731-1847" },
    update: {},
    create: {
      userId: user.id,
      applicationNo: "LN-20260731-1847",
      amountCents: 860000,
      status: "UNDER_REVIEW",
      submittedAt: new Date("2026-07-29T09:20:00+08:00")
    }
  });

  await prisma.repaymentRecord.upsert({
    where: { recordNo: "RP-20260730-7319" },
    update: {},
    create: {
      userId: user.id,
      recordNo: "RP-20260730-7319",
      amountCents: 218900,
      status: "FAILED",
      failedReason: "银行卡单笔限额不足",
      dueDate: new Date("2026-08-02T00:00:00+08:00")
    }
  });

  const seededTicket = await prisma.ticket.findUnique({
    where: { ticketNo: "FS-260731-1032" }
  });

  if (!seededTicket) {
    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        title: "还款失败咨询",
        messages: {
          create: [
            { role: "USER", content: "我的还款为什么失败了？" },
            {
              role: "ASSISTANT",
              content: "查询到最近一笔还款失败，原因是银行卡单笔限额不足。建议更换银行卡或拆分还款金额。"
            }
          ]
        }
      }
    });

    await prisma.ticket.create({
      data: {
        ticketNo: "FS-260731-1032",
        userId: user.id,
        conversationId: conversation.id,
        category: "repayment_failed",
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.PROCESSING,
        idempotencyKey: `${user.id}:${conversation.id}:seed-demo`,
        events: {
          create: [
            {
              eventType: "CREATED",
              operatorType: "AI",
              payload: { reason: "工具查询成功，但用户仍要求人工确认" }
            },
            {
              eventType: "STATUS_CHANGED",
              operatorType: "AGENT",
              operatorId: agent.id,
              payload: { from: "PENDING", to: "PROCESSING" }
            }
          ]
        },
        messages: {
          create: [
            {
              authorType: "AI",
              content: "AI 已附带还款记录和失败原因，请客服复核用户是否需要改卡。"
            },
            {
              authorType: "AGENT",
              authorId: agent.id,
              content: "已确认失败原因是单笔限额不足，建议用户更换银行卡后重新发起还款。"
            }
          ]
        }
      }
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
