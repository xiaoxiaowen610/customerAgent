import { PrismaClient, Role, TicketPriority, TicketStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 10);

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

  const ticket = await prisma.ticket.upsert({
    where: { idempotencyKey: `${user.id}:${conversation.id}:seed-demo` },
    update: {},
    create: {
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
          }
        ]
      }
    }
  });

  await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      authorId: agent.id,
      authorType: "AGENT",
      content: "已确认失败原因是单笔限额不足，建议用户更换银行卡后重新发起还款。"
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
