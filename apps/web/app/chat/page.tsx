"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, CircleDot, RefreshCw, Send, Square, UserRound, WandSparkles } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { API_BASE, apiFetch, authHeaders } from "../../lib/api";
import { useSessionState } from "../../lib/session";
import { readSse } from "../../lib/sse";

interface Conversation {
  id: string;
  title: string;
  status: string;
}

interface Message {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
  content: string;
}

interface TraceItem {
  id: string;
  kind: "status" | "tool";
  title: string;
  detail?: string;
}

export default function ChatPage() {
  const router = useRouter();
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("帮我查一下借款审核进度");
  const [draft, setDraft] = useState("");
  const [traces, setTraces] = useState<TraceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { session, ready } = useSessionState();

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!session) {
      router.replace("/login");
      return;
    }
    void createConversation();
  }, [ready, router, session]);

  useEffect(() => {
    const element = messageListRef.current;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [messages, draft]);

  async function createConversation() {
    setError("");
    try {
      const created = await apiFetch<Conversation>("/conversations", { method: "POST" });
      setConversation(created);
      setMessages([]);
      setTraces([]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建会话失败");
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!conversation || !input.trim() || loading) {
      return;
    }

    const content = input.trim();
    setInput("");
    setLoading(true);
    setError("");
    setDraft("");
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "USER", content }]);

    let assistantText = "";
    const requestController = new AbortController();
    requestControllerRef.current = requestController;
    try {
      const response = await fetch(`${API_BASE}/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ content }),
        signal: requestController.signal
      });
      if (!response.ok || !response.body) {
        throw new Error(await response.text());
      }

      await readSse(response, (event, data) => {
        if (event === "status") {
          setTraces((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${prev.length}`,
              kind: "status",
              title: String(data.label ?? data.stage ?? "执行中"),
              detail: stageLabel(String(data.stage ?? ""))
            }
          ]);
        }
        if (event === "tool") {
          setTraces((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${prev.length}`,
              kind: "tool",
              title: toolNameLabel(String(data.name ?? "")),
              detail: toolStatusLabel(String(data.status ?? ""))
            }
          ]);
        }
        if (event === "message") {
          assistantText += String(data.delta ?? "");
          setDraft(assistantText);
        }
        if (event === "done") {
          setMessages((prev) => [
            ...prev,
            {
              id: String(data.messageId ?? `assistant-${Date.now()}`),
              role: "ASSISTANT",
              content: assistantText
            }
          ]);
          setDraft("");
        }
        if (event === "error") {
          setError(String(data.message ?? "消息处理失败"));
        }
      }, requestController.signal);
    } catch (err) {
      setError(err instanceof DOMException && err.name === "AbortError" ? "已取消本次请求" : err instanceof Error ? err.message : "消息发送失败");
    } finally {
      requestControllerRef.current = null;
      setLoading(false);
    }
  }

  if (!ready || !session) {
    return null;
  }

  return (
    <AppShell role={session.user.role}>
      <header className="topbar">
        <div>
          <p className="eyebrow">用户端</p>
          <h1>智能客服会话</h1>
        </div>
        <button className="button secondary" type="button" onClick={createConversation}>
          <RefreshCw size={18} />
          新会话
        </button>
      </header>

      <div className="chat-layout">
        <section className="chat-window section" aria-label="会话消息">
          <div ref={messageListRef} className="message-list">
            <div className="message-stack">
              {messages.length === 0 && !draft ? (
                <div className="empty-state">
                  <WandSparkles size={22} />
                  <strong>选择一个演示问题开始</strong>
                </div>
              ) : null}
              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role === "USER" ? "user" : "assistant"}`}>
                  <span className="avatar" aria-hidden="true">
                    {message.role === "USER" ? <UserRound size={17} /> : <Bot size={17} />}
                  </span>
                  <p>{message.content}</p>
                </article>
              ))}
              {draft ? (
                <article className="message assistant">
                  <span className="avatar" aria-hidden="true">
                    <Bot size={17} />
                  </span>
                  <p>{draft}</p>
                </article>
              ) : null}
            </div>
          </div>
          <div className="chat-footer">
            <div className="model-mode-note">
              模型能力由服务端安全配置；未配置模型密钥时自动使用确定性演示模式。
            </div>
            <div className="prompt-row">
              {["帮我查一下借款审核进度", "为什么还款失败", "我要转人工"].map((prompt) => (
                <button key={prompt} className="prompt-chip" type="button" onClick={() => setInput(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
            <form className="composer" onSubmit={submit}>
              <input
                className="input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="输入咨询内容"
                disabled={loading}
              />
              {loading ? (
                <button
                  className="icon-button"
                  type="button"
                  aria-label="取消生成"
                  onClick={() => requestControllerRef.current?.abort()}
                >
                  <Square size={17} />
                </button>
              ) : (
                <button className="icon-button" type="submit" aria-label="发送消息" disabled={!conversation}>
                  <Send size={18} />
                </button>
              )}
            </form>
            {error ? <p className="error">{error}</p> : null}
          </div>
        </section>

        <aside className="trace-panel section" aria-label="AI 执行轨迹">
          <div className="panel-heading">
            <h2>AI 轨迹</h2>
            <span className="pill neutral">{conversation ? conversationStatusLabel(conversation.status) : "未开始"}</span>
          </div>
          <div className="trace-list">
            {traces.length === 0 ? <p className="muted-copy">暂无轨迹</p> : null}
            {traces.map((trace) => (
              <div key={trace.id} className="trace-item">
                <CircleDot size={15} />
                <div>
                  <strong>{trace.title}</strong>
                  {trace.detail ? <span>{trace.detail}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function conversationStatusLabel(value: string) {
  if (value === "ACTIVE") return "会话进行中";
  if (value === "TRANSFERRED_TO_HUMAN") return "已转人工";
  if (value === "CLOSED") return "已结束";
  return value;
}

function stageLabel(value: string) {
  if (value === "analyzing_intent") return "识别问题类型";
  if (value === "planning_tool") return "由模型选择白名单工具";
  if (value === "calling_tool") return "查询业务信息";
  if (value === "generating_answer") return "生成回复";
  if (value === "creating_ticket") return "转人工处理中";
  return value;
}

function toolNameLabel(value: string) {
  if (value === "queryLoanStatus") return "查询借款进度";
  if (value === "queryRepaymentRecord") return "查询还款记录";
  if (value === "createSupportTicket") return "创建人工工单";
  return value;
}

function toolStatusLabel(value: string) {
  if (value === "SUCCESS") return "已完成";
  if (value === "EMPTY") return "未查到结果";
  if (value === "FAILED") return "查询失败";
  return value;
}
