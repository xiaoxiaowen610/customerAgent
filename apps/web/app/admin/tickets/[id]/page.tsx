"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Bot, CheckCircle2, MessageSquareReply, Wrench } from "lucide-react";
import { AppShell } from "../../../../components/AppShell";
import { StatusPill } from "../../../../components/StatusPill";
import { apiFetch } from "../../../../lib/api";
import { useSessionState } from "../../../../lib/session";

interface TicketDetail {
  id: string;
  ticketNo: string;
  category: string;
  priority: string;
  status: string;
  user: { name: string; email: string };
  conversation?: {
    messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
    aiRuns: Array<{
      id: string;
      intent: string;
      confidence: string;
      status: string;
      metadata: any;
      toolCalls: Array<{ id: string; toolName: string; status: string; input: any; output: any }>;
    }>;
  };
  events: Array<{ id: string; eventType: string; operatorType: string; payload: any; createdAt: string }>;
  messages: Array<{ id: string; authorType: string; content: string; createdAt: string; author?: { name: string } }>;
}

interface ThreadItem {
  id: string;
  actor: string;
  side: "user" | "service";
  content: string;
  createdAt: string;
  tone: "user" | "assistant" | "agent" | "system";
}

export default function AdminTicketDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const { session, ready } = useSessionState();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.user.role === "USER") {
      router.replace("/chat");
      return;
    }
    void load();
  }, [ready, router, session, params.id]);

  useEffect(() => {
    const element = threadScrollRef.current;
    if (!element || !ticket) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [ticket]);

  async function load() {
    setError("");
    try {
      setTicket(await apiFetch<TicketDetail>(`/admin/tickets/${params.id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载工单失败");
    }
  }

  async function submitReply(event: FormEvent) {
    event.preventDefault();
    if (!reply.trim()) {
      setError("请输入客服回复");
      return;
    }
    setError("");
    try {
      await apiFetch(`/admin/tickets/${params.id}/replies`, {
        method: "POST",
        body: JSON.stringify({
          content: reply,
          nextStatus: nextStatus || undefined
        })
      });
      setReply("");
      setNextStatus("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "回复失败");
    }
  }

  if (!ready || !session || session.user.role === "USER") {
    return null;
  }

  const thread = buildThread(ticket);
  const latestRun = ticket?.conversation?.aiRuns[0];

  return (
    <AppShell role={session.user.role}>
      <header className="topbar">
        <div>
          <Link className="back-link" href="/admin/tickets">
            <ArrowLeft size={17} />
            返回工单工作台
          </Link>
          <h1>{ticket?.ticketNo ?? "工单详情"}</h1>
        </div>
        {ticket ? <StatusPill value={ticket.status} /> : null}
      </header>

      {error ? <p className="error">{error}</p> : null}
      {!ticket ? (
        <div className="empty">加载中</div>
      ) : (
        <div className="ticket-admin-layout">
          <section className="section ticket-thread-panel">
            <div className="ticket-thread-head">
              <div>
                <p className="eyebrow">对话记录</p>
                <h2>用户咨询与处理过程</h2>
              </div>
              <div className="ticket-thread-meta">
                <span className="pill neutral">{ticket.user.name}</span>
                <span className="pill neutral">{categoryLabel(ticket.category)}</span>
              </div>
            </div>

            <div ref={threadScrollRef} className="ticket-thread-scroll">
              <div className="ticket-thread-list">
                {thread.map((item) => (
                  <article key={item.id} className={`ticket-thread-item ${item.side}`}>
                    <div className={`ticket-thread-card ${item.tone}`}>
                      <div className="ticket-thread-meta-line">
                        <span className={`ticket-thread-badge ${item.tone}`}>{item.actor}</span>
                        <span className="subtext">{formatDateTime(item.createdAt)}</span>
                      </div>
                      <p>{item.content}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <form className="reply-box ticket-reply-dock" onSubmit={submitReply}>
              <label className="field">
                <span className="label">回复内容</span>
                <textarea
                  className="textarea"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="输入处理结论"
                />
              </label>
              <div className="reply-actions">
                <select className="select compact" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                  <option value="">不更新状态</option>
                  <option value="PROCESSING">处理中</option>
                  <option value="WAITING_USER">等待用户</option>
                  <option value="RESOLVED">已解决</option>
                  <option value="CLOSED">已关闭</option>
                </select>
                <button className="button primary" type="submit">
                  <MessageSquareReply size={18} />
                  回复用户
                </button>
              </div>
            </form>
          </section>

          <aside className="detail-side ticket-side-stack">
            <section className="section side-block">
              <h2>
                <Bot size={17} />
                工单概览
              </h2>
              <div className="facts">
                <p>
                  <span>用户</span>
                  <strong>{ticket.user.name}</strong>
                </p>
                <p>
                  <span>问题类型</span>
                  <strong>{categoryLabel(ticket.category)}</strong>
                </p>
                <p>
                  <span>优先级</span>
                  <strong>{priorityLabel(ticket.priority)}</strong>
                </p>
                <p>
                  <span>当前状态</span>
                  <strong>{statusLabel(ticket.status)}</strong>
                </p>
              </div>
            </section>

            <section className="section side-block">
              <h2>
                <Bot size={17} />
                AI 识别结果
              </h2>
              {latestRun ? (
                <div className="facts">
                  <p>
                    <span>识别问题</span>
                    <strong>{intentLabel(latestRun.intent)}</strong>
                  </p>
                  <p>
                    <span>识别把握</span>
                    <strong>{confidenceLabel(latestRun.confidence)}</strong>
                  </p>
                  <p>
                    <span>AI 阶段</span>
                    <strong>{runStatusLabel(latestRun.status)}</strong>
                  </p>
                </div>
              ) : (
                <p className="muted-copy">当前没有 AI 判断记录</p>
              )}
            </section>

            <section className="section side-block">
              <h2>
                <Wrench size={17} />
                查询记录
              </h2>
              <div className="audit-list compact-list">
                {latestRun?.toolCalls.length ? (
                  latestRun.toolCalls.map((tool) => (
                    <div key={tool.id} className="audit-row">
                      <span className={`pill ${toolTone(tool.status)}`}>{toolStatusLabel(tool.status)}</span>
                      <div className="audit-row-block">
                        <p>{toolNameLabel(tool.toolName)}</p>
                        <span className="subtext">{toolSummary(tool.toolName, tool.output)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted-copy">当前没有查询记录</p>
                )}
              </div>
            </section>

            <section className="section side-block">
              <h2>
                <CheckCircle2 size={17} />
                处理轨迹
              </h2>
              <p className="audit-note">用用户能看懂的话展示这张工单已经走到了哪一步。</p>
              <div className="audit-list compact-list">
                {ticket.events.map((event) => (
                  <div key={event.id} className="audit-row">
                    <span className="pill neutral">{operatorLabel(event.operatorType)}</span>
                    <div className="audit-row-block">
                      <p>{eventLabel(event.eventType, event.payload)}</p>
                      <span className="subtext">{formatDateTime(event.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function categoryLabel(value: string) {
  return value === "loan_status" ? "借款进度咨询" : value === "repayment_failed" ? "还款失败咨询" : "人工客服咨询";
}

function priorityLabel(value: string) {
  return value === "HIGH" ? "高优先级" : value === "MEDIUM" ? "中优先级" : "低优先级";
}

function statusLabel(value: string) {
  if (value === "PENDING") return "待处理";
  if (value === "PROCESSING") return "处理中";
  if (value === "WAITING_USER") return "等待用户补充";
  if (value === "RESOLVED") return "已解决";
  if (value === "CLOSED") return "已关闭";
  return value;
}

function intentLabel(value: string) {
  if (value === "loan_status") return "借款进度问题";
  if (value === "repayment_failed") return "还款失败问题";
  if (value === "unknown") return "无法明确识别";
  return value;
}

function confidenceLabel(value: string) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return value;
  return `${Math.round(numeric * 100)}%`;
}

function runStatusLabel(value: string) {
  if (value === "COMPLETED") return "已完成识别";
  if (value === "ESCALATED") return "已转人工";
  if (value === "RUNNING") return "识别中";
  return value;
}

function toolNameLabel(value: string) {
  if (value === "queryLoanStatus") return "查询借款进度";
  if (value === "queryRepaymentRecord") return "查询还款记录";
  if (value === "createSupportTicket") return "创建人工工单";
  return value;
}

function toolStatusLabel(value: string) {
  if (value === "SUCCESS") return "成功";
  if (value === "EMPTY") return "无结果";
  if (value === "FAILED") return "失败";
  return value;
}

function toolTone(value: string) {
  if (value === "FAILED") return "danger";
  if (value === "EMPTY") return "warning";
  return "neutral";
}

function toolSummary(toolName: string, output: Record<string, unknown> | null | undefined) {
  if (!output) return "没有返回可用结果";
  if (toolName === "queryRepaymentRecord" && typeof output.failedReason === "string") {
    return `失败原因：${output.failedReason}`;
  }
  if (toolName === "queryLoanStatus" && typeof output.statusText === "string") {
    return `当前状态：${output.statusText}`;
  }
  if (toolName === "createSupportTicket" && typeof output.ticketNo === "string") {
    return `生成工单号：${output.ticketNo}`;
  }
  return "已完成查询";
}

function operatorLabel(value: string) {
  if (value === "AI") return "系统";
  if (value === "AGENT") return "客服";
  if (value === "USER") return "用户";
  return value;
}

function eventLabel(value: string, payload: Record<string, unknown> | null | undefined) {
  if (value === "CREATED") return "系统已创建人工工单";
  if (value === "AGENT_REPLIED") return "客服已给出回复";
  if (value === "STATUS_CHANGED" && payload?.to && typeof payload.to === "string") {
    return `工单状态更新为：${statusLabel(payload.to)}`;
  }
  return value;
}

function roleLabel(value: string) {
  if (value === "USER") return "用户";
  if (value === "ASSISTANT") return "AI 客服";
  if (value === "SYSTEM") return "系统记录";
  if (value === "TOOL") return "工具回执";
  return value;
}

function buildThread(ticket: TicketDetail | null): ThreadItem[] {
  if (!ticket) {
    return [];
  }

  const conversationItems =
    ticket.conversation?.messages.map((message) => ({
      id: `conversation-${message.id}`,
      actor: roleLabel(message.role),
      side: message.role === "USER" ? ("user" as const) : ("service" as const),
      content: message.content,
      createdAt: message.createdAt,
      tone: message.role === "USER" ? ("user" as const) : ("assistant" as const)
    })) ?? [];

  const ticketItems = ticket.messages.map((message) => ({
    id: `ticket-${message.id}`,
    actor: message.authorType === "AGENT" ? (message.author?.name ?? "人工客服") : message.authorType === "AI" ? "系统转单" : "用户",
    side: message.authorType === "USER" ? ("user" as const) : ("service" as const),
    content: message.authorType === "AI" && message.content.startsWith("AI 转人工原因：")
      ? message.content.replace("AI 转人工原因：", "系统转人工原因：")
      : message.content,
    createdAt: message.createdAt,
    tone:
      message.authorType === "USER"
        ? ("user" as const)
        : message.authorType === "AGENT"
          ? ("agent" as const)
          : ("system" as const)
  }));

  return [...conversationItems, ...ticketItems].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
