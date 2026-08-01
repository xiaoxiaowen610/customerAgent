"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { apiFetch } from "../../../lib/api";
import { useSessionState } from "../../../lib/session";

interface Metrics {
  requestCount: number;
  completionRate: number;
  escalationRate: number;
  toolSuccessRate: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  openTickets: number;
  sample: { runs: number; tools: number };
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { session, ready } = useSessionState();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!session) return router.replace("/login");
    if (session.user.role === "USER") return router.replace("/chat");
    apiFetch<Metrics>("/admin/metrics").then(setMetrics).catch((reason) => setError(reason instanceof Error ? reason.message : "指标加载失败"));
  }, [ready, router, session]);

  if (!ready || !session || session.user.role === "USER") return null;
  const cards = metrics ? [
    ["Agent 请求", String(metrics.requestCount), `最近 ${metrics.sample.runs} 次运行`],
    ["完成率", percent(metrics.completionRate), "可靠完成"],
    ["转人工率", percent(metrics.escalationRate), `${metrics.openTickets} 个待处理工单`],
    ["工具成功率", percent(metrics.toolSuccessRate), `${metrics.sample.tools} 次工具调用`],
    ["平均延迟", `${metrics.averageLatencyMs} ms`, "端到端运行"],
    ["P95 延迟", `${metrics.p95LatencyMs} ms`, "最近运行样本"]
  ] : [];

  return <AppShell role={session.user.role}>
    <header className="topbar"><div><p className="eyebrow">可观测性</p><h1>Agent 运行指标</h1><p className="muted">数据直接来自 AI 与工具审计记录，默认展示最近 500 次运行。</p></div></header>
    {error ? <p className="error">{error}</p> : null}
    {!metrics ? <div className="empty">正在加载指标…</div> : <section className="metrics-grid">
      {cards.map(([label, value, note]) => <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}
    </section>}
  </AppShell>;
}

function percent(value: number) { return `${Math.round(value * 100)}%`; }
