"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { StatusPill } from "../../components/StatusPill";
import { apiFetch } from "../../lib/api";
import { useSessionState } from "../../lib/session";

interface TicketRow {
  id: string;
  ticketNo: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
}

export default function TicketsPage() {
  const router = useRouter();
  const { session, ready } = useSessionState();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!session) {
      router.replace("/login");
      return;
    }
    void apiFetch<TicketRow[]>("/tickets")
      .then(setTickets)
      .catch((err) => setError(err instanceof Error ? err.message : "加载工单失败"));
  }, [ready, router, session]);

  if (!ready || !session) {
    return null;
  }

  return (
    <AppShell role={session.user.role}>
      <header className="topbar">
        <div>
          <p className="eyebrow">用户端</p>
          <h1>我的工单</h1>
        </div>
      </header>
      <section className="section table-panel">
        {error ? <p className="error">{error}</p> : null}
        {tickets.length === 0 ? (
          <div className="empty">暂无工单</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>工单号</th>
                <th>分类</th>
                <th>优先级</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td className="mono">{ticket.ticketNo}</td>
                  <td>{categoryLabel(ticket.category)}</td>
                  <td>{priorityLabel(ticket.priority)}</td>
                  <td>
                    <StatusPill value={ticket.status} />
                  </td>
                  <td>{new Date(ticket.createdAt).toLocaleString("zh-CN")}</td>
                  <td>
                    <Link className="icon-link" href={`/tickets/${ticket.id}`} aria-label="查看工单详情">
                      <ArrowUpRight size={18} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  );
}

function categoryLabel(value: string) {
  return value === "loan_status" ? "借款进度咨询" : value === "repayment_failed" ? "还款失败咨询" : "人工客服咨询";
}

function priorityLabel(value: string) {
  return value === "HIGH" ? "高" : value === "MEDIUM" ? "中" : value === "LOW" ? "低" : value;
}
