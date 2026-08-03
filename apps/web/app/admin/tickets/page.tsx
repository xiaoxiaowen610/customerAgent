"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Filter, Search } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { StatusPill } from "../../../components/StatusPill";
import { apiFetch } from "../../../lib/api";
import { useSessionState } from "../../../lib/session";

interface TicketRow {
  id: string;
  ticketNo: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  user: { name: string; email: string };
}

interface TicketPage {
  items: TicketRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function AdminTicketsPage() {
  const router = useRouter();
  const { session, ready } = useSessionState();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
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
    void loadTickets();
  }, [ready, router, session, status, page, search]);

  async function loadTickets() {
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (status) params.set("status", status);
      if (search) params.set("q", search);
      const result = await apiFetch<TicketPage>(`/admin/tickets?${params}`);
      setTickets(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载工单失败");
    }
  }

  if (!ready || !session || session.user.role === "USER") {
    return null;
  }

  return (
    <AppShell role={session.user.role}>
      <header className="topbar">
        <div>
          <p className="eyebrow">客服端</p>
          <h1>工单工作台</h1>
        </div>
        <div className="toolbar-controls">
          <form className="search-control" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}>
            <Search size={17} />
            <input aria-label="搜索工单" placeholder="工单号、姓名或邮箱" value={query} onChange={(event) => setQuery(event.target.value)} />
            <button className="button secondary compact" type="submit">搜索</button>
          </form>
          <label className="filter-control">
            <Filter size={17} />
            <select className="select compact" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
            <option value="">全部状态</option>
            <option value="PENDING">待处理</option>
            <option value="PROCESSING">处理中</option>
            <option value="WAITING_USER">等待用户</option>
            <option value="RESOLVED">已解决</option>
            <option value="CLOSED">已关闭</option>
            </select>
          </label>
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
                <th>用户</th>
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
                  <td>
                    <strong>{ticket.user.name}</strong>
                    <span className="subtext">{ticket.user.email}</span>
                  </td>
                  <td>{categoryLabel(ticket.category)}</td>
                  <td>{priorityLabel(ticket.priority)}</td>
                  <td>
                    <StatusPill value={ticket.status} />
                  </td>
                  <td>{formatDate(ticket.createdAt)}</td>
                  <td>
                    <Link className="icon-link" href={`/admin/tickets/${ticket.id}`} aria-label="查看工单详情">
                      <ArrowUpRight size={18} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <nav className="pagination" aria-label="工单分页">
        <span>共 {total} 条 · 第 {page}/{totalPages} 页</span>
        <div>
          <button className="button secondary compact" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button>
          <button className="button secondary compact" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</button>
        </div>
      </nav>
    </AppShell>
  );
}

function categoryLabel(value: string) {
  return value === "loan_status" ? "借款进度咨询" : value === "repayment_failed" ? "还款失败咨询" : "人工客服咨询";
}

function priorityLabel(value: string) {
  return value === "HIGH" ? "高" : value === "MEDIUM" ? "中" : value === "LOW" ? "低" : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
