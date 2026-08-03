"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { apiFetch } from "../../../lib/api";
import { useSessionState } from "../../../lib/session";
import styles from "./page.module.css";

interface PromptVersion {
  id: string;
  name: string;
  version: number;
  content: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  activatedAt?: string | null;
  _count: { evaluations: number; caseRuns: number };
}

interface EvaluationItem {
  id: string;
  totalScore: number;
  correctnessScore: number;
  toolUsageScore: number;
  safetyScore: number;
  passed: boolean;
  createdAt: string;
  aiRun: { intent: string; status: string; latencyMs: number; requestId?: string | null; createdAt: string };
  promptVersion?: PromptVersion | null;
}

interface CaseRun {
  id: string;
  totalScore: number;
  passed: boolean;
  actualIntent: string;
  actualTool?: string | null;
  createdAt: string;
  evaluationCase: { name: string; expectedIntent: string; expectedTool?: string | null };
}

interface Dashboard {
  metrics: {
    evaluationCount: number;
    passRate: number;
    averageScore: number;
    averageCorrectness: number;
    averageToolUsage: number;
    averageSafety: number;
    reviewCount: number;
    pendingReviewCount: number;
    caseRunCount: number;
    regressionPassRate: number;
  };
  prompts: PromptVersion[];
  recentEvaluations: EvaluationItem[];
  recentCaseRuns: CaseRun[];
}

interface ReviewTask {
  id: string;
  reason: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  createdAt: string;
  aiRun: { intent: string; status: string; latencyMs: number; requestId?: string | null };
  evaluation?: { totalScore: number } | null;
  assignee?: { name: string } | null;
}

interface SuiteResult {
  total: number;
  passed: number;
  passRate: number;
}

export default function EvaluationPage() {
  const router = useRouter();
  const { session, ready } = useSessionState();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [reviews, setReviews] = useState<ReviewTask[]>([]);
  const [promptContent, setPromptContent] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const [nextDashboard, nextReviews] = await Promise.all([
      apiFetch<Dashboard>("/admin/evaluation/dashboard"),
      apiFetch<ReviewTask[]>("/admin/evaluation/reviews")
    ]);
    setDashboard(nextDashboard);
    setReviews(nextReviews);
  }

  useEffect(() => {
    if (!ready) return;
    if (!session) return router.replace("/login");
    if (session.user.role === "USER") return router.replace("/chat");
    refresh().catch((reason) => setError(messageOf(reason, "评估数据加载失败")));
  }, [ready, router, session]);

  async function runSuite() {
    setBusy("suite");
    setError("");
    try {
      const result = await apiFetch<SuiteResult>("/admin/evaluation/run-suite", { method: "POST", body: "{}" });
      setNotice(`回归完成：${result.passed}/${result.total} 通过（${percent(result.passRate)}）`);
      await refresh();
    } catch (reason) {
      setError(messageOf(reason, "回归执行失败"));
    } finally {
      setBusy("");
    }
  }

  async function createPrompt() {
    if (promptContent.trim().length < 20) return setError("Prompt 至少需要 20 个字符");
    setBusy("prompt");
    setError("");
    try {
      await apiFetch<PromptVersion>("/admin/evaluation/prompts", {
        method: "POST",
        body: JSON.stringify({ name: "customer-service", content: promptContent })
      });
      setPromptContent("");
      setNotice("已创建新的 Prompt 草稿版本");
      await refresh();
    } catch (reason) {
      setError(messageOf(reason, "Prompt 创建失败"));
    } finally {
      setBusy("");
    }
  }

  async function activatePrompt(id: string) {
    setBusy(id);
    setError("");
    try {
      await apiFetch(`/admin/evaluation/prompts/${id}/activate`, { method: "POST", body: "{}" });
      setNotice("Prompt 版本已激活，旧版本已归档");
      await refresh();
    } catch (reason) {
      setError(messageOf(reason, "Prompt 激活失败"));
    } finally {
      setBusy("");
    }
  }

  async function decideReview(id: string, status: "APPROVED" | "REJECTED") {
    setBusy(id);
    setError("");
    try {
      await apiFetch(`/admin/evaluation/reviews/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, decisionNote: status === "APPROVED" ? "人工复核通过" : "人工复核不通过，需进入回归样本" })
      });
      setNotice(status === "APPROVED" ? "复核任务已通过" : "复核任务已拒绝");
      await refresh();
    } catch (reason) {
      setError(messageOf(reason, "复核提交失败"));
    } finally {
      setBusy("");
    }
  }

  if (!ready || !session || session.user.role === "USER") return null;
  const metrics = dashboard?.metrics;
  const cards = metrics
    ? [
        ["在线评估", String(metrics.evaluationCount), `通过率 ${percent(metrics.passRate)}`],
        ["平均质量分", String(metrics.averageScore), `正确性 ${metrics.averageCorrectness}`],
        ["工具使用分", String(metrics.averageToolUsage), `安全分 ${metrics.averageSafety}`],
        ["待人工复核", String(metrics.pendingReviewCount), `累计 ${metrics.reviewCount}`],
        ["回归执行", String(metrics.caseRunCount), `通过率 ${percent(metrics.regressionPassRate)}`]
      ]
    : [];

  return (
    <AppShell role={session.user.role}>
      <header className="topbar">
        <div>
          <p className="eyebrow">B04 · Evaluation & Governance</p>
          <h1>Agent 质量治理</h1>
          <p className="muted-copy">在线运行评分、Golden Dataset 回归、Prompt 版本和 Human Review 闭环。</p>
        </div>
        <button className="button primary" type="button" onClick={runSuite} disabled={Boolean(busy)}>
          {busy === "suite" ? "正在执行…" : "运行 Golden Suite"}
        </button>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {!dashboard ? (
        <div className="empty">正在加载质量治理数据…</div>
      ) : (
        <>
          <section className="metrics-grid">
            {cards.map(([label, value, note]) => (
              <article className="metric-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{note}</small>
              </article>
            ))}
          </section>

          <section className={styles.twoColumns}>
            <article className={`section ${styles.block}`}>
              <div className={styles.heading}>
                <div><p className="eyebrow">Prompt Registry</p><h2>版本管理</h2></div>
              </div>
              <textarea
                className="textarea"
                value={promptContent}
                onChange={(event) => setPromptContent(event.target.value)}
                placeholder="输入新的客服 Agent 系统 Prompt，保存为草稿版本"
              />
              <button className="button secondary" type="button" onClick={createPrompt} disabled={Boolean(busy)}>
                {busy === "prompt" ? "保存中…" : "创建 Prompt 草稿"}
              </button>
              <div className={styles.stack}>
                {dashboard.prompts.map((prompt) => (
                  <div className={styles.prompt} key={prompt.id}>
                    <div>
                      <strong>{prompt.name} v{prompt.version}</strong>
                      <span className={`pill ${prompt.status === "ACTIVE" ? "" : "neutral"}`}>{prompt.status}</span>
                      <p>{prompt.content}</p>
                      <small>在线评估 {prompt._count.evaluations} · 回归 {prompt._count.caseRuns}</small>
                    </div>
                    {prompt.status !== "ACTIVE" ? (
                      <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => activatePrompt(prompt.id)}>
                        {busy === prompt.id ? "切换中…" : "激活"}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>

            <article className={`section ${styles.block}`}>
              <div className={styles.heading}><div><p className="eyebrow">Human Review</p><h2>人工复核队列</h2></div></div>
              <div className={styles.stack}>
                {reviews.length ? reviews.map((review) => (
                  <div className={styles.review} key={review.id}>
                    <div>
                      <div className={styles.inline}>
                        <span className={`pill ${review.priority === "HIGH" ? "danger" : review.priority === "MEDIUM" ? "warning" : "neutral"}`}>{review.priority}</span>
                        <span className="pill neutral">{review.status}</span>
                      </div>
                      <strong>{review.aiRun.intent} · {review.evaluation?.totalScore ?? 0} 分</strong>
                      <p>{review.reason}</p>
                      <small className="mono">{review.aiRun.requestId ?? review.id}</small>
                    </div>
                    {review.status === "PENDING" || review.status === "IN_REVIEW" ? (
                      <div className={styles.actions}>
                        <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => decideReview(review.id, "APPROVED")}>通过</button>
                        <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => decideReview(review.id, "REJECTED")}>拒绝</button>
                      </div>
                    ) : null}
                  </div>
                )) : <div className="empty">暂无待复核运行</div>}
              </div>
            </article>
          </section>

          <section className={styles.twoColumns}>
            <article className={`section ${styles.block}`}>
              <div className={styles.heading}><div><p className="eyebrow">Online Evaluation</p><h2>最近运行评分</h2></div></div>
              <div className="table-panel">
                <table className="table">
                  <thead><tr><th>意图</th><th>状态</th><th>评分</th><th>延迟</th></tr></thead>
                  <tbody>{dashboard.recentEvaluations.map((item) => (
                    <tr key={item.id}>
                      <td>{item.aiRun.intent}<span className="subtext mono">{item.aiRun.requestId ?? "-"}</span></td>
                      <td><span className={`pill ${item.passed ? "" : "danger"}`}>{item.aiRun.status}</span></td>
                      <td><strong>{item.totalScore}</strong><span className="subtext">正确 {item.correctnessScore} / 工具 {item.toolUsageScore}</span></td>
                      <td>{item.aiRun.latencyMs} ms</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </article>

            <article className={`section ${styles.block}`}>
              <div className={styles.heading}><div><p className="eyebrow">Regression</p><h2>最近 Golden Case</h2></div></div>
              <div className="table-panel">
                <table className="table">
                  <thead><tr><th>Case</th><th>实际路由</th><th>结果</th></tr></thead>
                  <tbody>{dashboard.recentCaseRuns.map((item) => (
                    <tr key={item.id}>
                      <td>{item.evaluationCase.name}<span className="subtext">期望 {item.evaluationCase.expectedIntent}</span></td>
                      <td>{item.actualIntent}<span className="subtext mono">{item.actualTool ?? "-"}</span></td>
                      <td><span className={`pill ${item.passed ? "" : "danger"}`}>{item.totalScore} 分</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </article>
          </section>
        </>
      )}
    </AppShell>
  );
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function messageOf(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
