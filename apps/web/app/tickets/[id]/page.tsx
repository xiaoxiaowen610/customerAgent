"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { apiFetch } from "../../../lib/api";
import { useSessionState } from "../../../lib/session";

interface TicketDetail {
  ticketNo: string;
  category: string;
  status: string;
  messages: Array<{ id: string; authorType: string; content: string; createdAt: string }>;
  events: Array<{ id: string; eventType: string; operatorType: string; createdAt: string }>;
}

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { session, ready } = useSessionState();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!session) {
      router.replace("/login");
      return;
    }
    void apiFetch<TicketDetail>(`/tickets/${params.id}`)
      .then(setTicket)
      .catch((err) => setError(err instanceof Error ? err.message : "加载工单失败"));
  }, [ready, router, session, params.id]);

  if (!ready || !session) {
    return null;
  }

  return (
    <AppShell role={session.user.role}>
      <header className="topbar">
        <div>
          <Link className="back-link" href="/tickets">
            <ArrowLeft size={17} />
            返回我的工单
          </Link>
          <h1>{ticket?.ticketNo ?? "工单详情"}</h1>
        </div>
        {ticket ? <span className={`ticket-page-status ${statusTone(ticket.status)}`}>{statusLabel(ticket.status)}</span> : null}
      </header>
      {error ? <p className="error">{error}</p> : null}
      {!ticket ? (
        <div className="empty">加载中</div>
      ) : (
        <div className="detail-grid ticket-detail-layout">
          <section className="section detail-main ticket-detail-main">
            <div className="ticket-explainer">
              <div className="ticket-explainer-head">
                <div>
                  <p className="eyebrow">当前进度</p>
                  <h2>{buildStatusHeadline(ticket.status)}</h2>
                </div>
              </div>
              <p className="ticket-explainer-copy">{buildStatusDescription(ticket.status)}</p>
              <div className="ticket-issue-block">
                <span className="ticket-issue-label">当前问题类型</span>
                <strong className="ticket-issue-value">{categoryLabel(ticket.category)}</strong>
              </div>
              <div className="ticket-summary-grid">
                <div className={`ticket-summary-card current ${statusTone(ticket.status)}`}>
                  <span className="ticket-summary-label">当前状态</span>
                  <strong>{statusLabel(ticket.status)}</strong>
                </div>
                <div className={`ticket-summary-card next ${nextStepTone(ticket.status)}`}>
                  <span className="ticket-summary-label">下一步</span>
                  <strong>{buildNextStep(ticket.status)}</strong>
                </div>
              </div>
            </div>

            <h2>处理记录</h2>
            <div className="ticket-record-list">
              {ticket.messages.map((message) => (
                <article key={message.id} className={`ticket-record-item ${actorTone(message.authorType)}`}>
                  <div className="ticket-record-head">
                    <span className={`ticket-record-badge ${actorTone(message.authorType)}`}>{authorLabel(message.authorType)}</span>
                    <div className="ticket-time-stack">
                      <span className="ticket-time-caption">记录时间</span>
                      <time className="ticket-time">{formatDateTime(message.createdAt)}</time>
                    </div>
                  </div>
                  <div className="ticket-record-body">
                    <p>{messageText(message)}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <aside className="detail-side ticket-detail-side">
            <section className="section side-block ticket-progress-panel">
              <h2>处理进度</h2>
              <p className="audit-note">按时间展示工单创建、状态推进和客服接手动作。</p>
              <div className="ticket-timeline-list">
                {ticket.events.map((event, index) => (
                  <article key={event.id} className="ticket-timeline-item">
                    <div className="ticket-timeline-rail" aria-hidden="true">
                      <span className={`ticket-record-badge ${actorTone(event.operatorType)}`}>{operatorLabel(event.operatorType)}</span>
                      {index < ticket.events.length - 1 ? <span className="ticket-timeline-line" /> : null}
                    </div>
                    <div className={`ticket-timeline-card ${eventTone(event.eventType)}`}>
                      <strong className="ticket-timeline-title">{eventLabel(event.eventType, event.operatorType)}</strong>
                      <div className="ticket-time-stack">
                        <span className="ticket-time-caption">{eventTimeLabel(event.eventType)}</span>
                        <time className="ticket-time">{formatDateTime(event.createdAt)}</time>
                      </div>
                    </div>
                  </article>
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
  return value === "loan_status" ? "借款审核进度咨询" : value === "repayment_failed" ? "还款失败处理咨询" : "人工客服咨询";
}

function statusLabel(value: string) {
  if (value === "PENDING") return "待处理";
  if (value === "PROCESSING") return "处理中";
  if (value === "WAITING_USER") return "等待你补充信息";
  if (value === "RESOLVED") return "已处理";
  if (value === "CLOSED") return "已结束";
  return value;
}

function statusTone(value: string) {
  if (value === "PENDING") return "pending";
  if (value === "PROCESSING") return "processing";
  if (value === "WAITING_USER") return "waiting";
  if (value === "RESOLVED") return "resolved";
  if (value === "CLOSED") return "closed";
  return "neutral";
}

function buildStatusDescription(value: string) {
  if (value === "PENDING") return "你的咨询已成功转入人工客服处理队列，客服专员将按受理顺序接单并跟进。";
  if (value === "PROCESSING") return "人工客服已开始核对问题信息，正在整理处理方案并准备反馈处理结果。";
  if (value === "WAITING_USER") return "客服已发起补充信息请求，待你补充必要资料后将继续推进处理。";
  if (value === "RESOLVED") return "客服已提供处理结论，请确认处理结果；如无异议，服务单将进入结束流程。";
  if (value === "CLOSED") return "该服务单已完成处理并归档，如需继续咨询，可重新发起新的服务请求。";
  return "该服务单正在按流程处理中。";
}

function buildStatusHeadline(value: string) {
  if (value === "PENDING") return "已进入人工客服受理流程";
  if (value === "PROCESSING") return "人工客服正在处理中";
  if (value === "WAITING_USER") return "等待你补充处理信息";
  if (value === "RESOLVED") return "已生成处理结论";
  if (value === "CLOSED") return "服务单已处理完成";
  return "人工客服服务单";
}

function buildNextStep(value: string) {
  if (value === "PENDING") return "由客服专员接单并开始处理";
  if (value === "PROCESSING") return "客服核对完成后反馈处理结果";
  if (value === "WAITING_USER") return "等待你补充资料后继续推进";
  if (value === "RESOLVED") return "请确认处理结果，确认后结束服务单";
  if (value === "CLOSED") return "当前服务单已归档，无需继续操作";
  return "等待下一步处理";
}

function nextStepTone(value: string) {
  if (value === "WAITING_USER") return "waiting";
  if (value === "RESOLVED" || value === "CLOSED") return "resolved";
  return "next";
}

function authorLabel(value: string) {
  if (value === "AI") return "系统记录";
  if (value === "AGENT") return "客服处理";
  if (value === "USER") return "你的补充";
  return value;
}

function actorTone(value: string) {
  if (value === "AI") return "system";
  if (value === "AGENT") return "agent";
  if (value === "USER") return "user";
  return "neutral";
}

function operatorLabel(value: string) {
  if (value === "AI") return "系统";
  if (value === "AGENT") return "客服";
  if (value === "USER") return "用户";
  return value;
}

function eventLabel(value: string, operatorType: string) {
  if (value === "CREATED") return "人工服务单已创建";
  if (value === "STATUS_CHANGED" && operatorType === "AGENT") return "客服已接单并开始处理";
  if (value === "STATUS_CHANGED") return "服务单状态已更新";
  if (value === "AGENT_REPLIED") return "客服已反馈处理结果";
  return value;
}

function eventTone(value: string) {
  if (value === "CREATED") return "system";
  if (value === "AGENT_REPLIED") return "resolved";
  if (value === "STATUS_CHANGED") return "processing";
  return "neutral";
}

function eventTimeLabel(value: string) {
  if (value === "CREATED") return "创建时间";
  if (value === "AGENT_REPLIED") return "回复时间";
  if (value === "STATUS_CHANGED") return "更新时间";
  return "处理时间";
}

function messageText(message: TicketDetail["messages"][number]) {
  if (message.authorType === "AI" && message.content.startsWith("AI 转人工原因：")) {
    return message.content.replace("AI 转人工原因：", "转人工原因：");
  }
  return message.content;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}
