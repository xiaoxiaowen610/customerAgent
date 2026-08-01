"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, CircleDot, RefreshCw, Send, UserRound, WandSparkles } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { API_BASE, apiFetch, authHeaders } from "../../lib/api";
import { useSessionState } from "../../lib/session";

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

interface LlmConfigState {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const DEFAULT_LLM_CONFIG: LlmConfigState = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash"
};

export default function ChatPage() {
  const router = useRouter();
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("帮我查一下借款审核进度");
  const [draft, setDraft] = useState("");
  const [traces, setTraces] = useState<TraceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [llmConfig, setLlmConfig] = useState<LlmConfigState>(DEFAULT_LLM_CONFIG);
  const [llmReady, setLlmReady] = useState(false);
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
    const saved = window.localStorage.getItem("finserve.deepseek.config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<LlmConfigState>;
        setLlmConfig({
          apiKey: parsed.apiKey ?? DEFAULT_LLM_CONFIG.apiKey,
          baseUrl: parsed.baseUrl ?? DEFAULT_LLM_CONFIG.baseUrl,
          model: parsed.model ?? DEFAULT_LLM_CONFIG.model
        });
      } catch {
        window.localStorage.removeItem("finserve.deepseek.config");
      }
    }
    setLlmReady(true);
  }, []);

  useEffect(() => {
    if (!llmReady) {
      return;
    }
    window.localStorage.setItem("finserve.deepseek.config", JSON.stringify(llmConfig));
  }, [llmConfig, llmReady]);

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
    try {
      const response = await fetch(`${API_BASE}/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ content, llmConfig: buildLlmPayload(llmConfig) })
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
              title: data.label ?? data.stage,
              detail: stageLabel(data.stage)
            }
          ]);
        }
        if (event === "tool") {
          setTraces((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${prev.length}`,
              kind: "tool",
              title: toolNameLabel(data.name),
              detail: toolStatusLabel(data.status)
            }
          ]);
        }
        if (event === "message") {
          assistantText += data.delta ?? "";
          setDraft(assistantText);
        }
        if (event === "done") {
          setMessages((prev) => [
            ...prev,
            {
              id: data.messageId ?? `assistant-${Date.now()}`,
              role: "ASSISTANT",
              content: assistantText
            }
          ]);
          setDraft("");
        }
        if (event === "error") {
          setError(data.message ?? "消息处理失败");
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "消息发送失败");
    } finally {
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
            <section className="llm-config-panel" aria-label="模型配置">
              <div className="panel-heading compact">
                <h2>模型配置</h2>
                <span className="pill neutral">{llmConfig.apiKey.trim() ? "DeepSeek 已启用" : "演示模式"}</span>
              </div>
              <div className="llm-config-grid">
                <label className="field">
                  <span className="label">DeepSeek API Key</span>
                  <input
                    className="input"
                    type="password"
                    value={llmConfig.apiKey}
                    onChange={(event) => setLlmConfig((prev) => ({ ...prev, apiKey: event.target.value }))}
                    placeholder="sk-..."
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label className="field">
                  <span className="label">Base URL</span>
                  <input
                    className="input"
                    value={llmConfig.baseUrl}
                    onChange={(event) => setLlmConfig((prev) => ({ ...prev, baseUrl: event.target.value }))}
                    placeholder="https://api.deepseek.com"
                    spellCheck={false}
                  />
                </label>
                <label className="field">
                  <span className="label">Model</span>
                  <input
                    className="input"
                    value={llmConfig.model}
                    onChange={(event) => setLlmConfig((prev) => ({ ...prev, model: event.target.value }))}
                    placeholder="deepseek-v4-flash"
                    spellCheck={false}
                  />
                </label>
              </div>
              <p className="muted-copy">仅保存在当前浏览器；留空 API Key 时继续走本地演示编排。</p>
            </section>
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
              <button className="icon-button" type="submit" aria-label="发送消息" disabled={loading || !conversation}>
                <Send size={18} />
              </button>
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

async function readSse(response: Response, onEvent: (event: string, data: Record<string, any>) => void) {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const event = part
        .split("\n")
        .find((line) => line.startsWith("event:"))
        ?.replace("event:", "")
        .trim();
      const dataLine = part
        .split("\n")
        .find((line) => line.startsWith("data:"))
        ?.replace("data:", "")
        .trim();
      if (event && dataLine) {
        onEvent(event, JSON.parse(dataLine));
      }
    }
  }
}

function conversationStatusLabel(value: string) {
  if (value === "ACTIVE") return "会话进行中";
  if (value === "TRANSFERRED_TO_HUMAN") return "已转人工";
  if (value === "CLOSED") return "已结束";
  return value;
}

function stageLabel(value: string) {
  if (value === "analyzing_intent") return "识别问题类型";
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

function buildLlmPayload(config: LlmConfigState) {
  if (!config.apiKey.trim()) {
    return undefined;
  }
  return {
    apiKey: config.apiKey.trim(),
    ...(config.baseUrl.trim() ? { baseUrl: config.baseUrl.trim() } : {}),
    ...(config.model.trim() ? { model: config.model.trim() } : {})
  };
}
