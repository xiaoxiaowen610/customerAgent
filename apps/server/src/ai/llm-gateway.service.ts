import { Injectable, Optional } from "@nestjs/common";
import { EvaluationService } from "../evaluation/evaluation.service";
import type { RegisteredToolDefinition } from "./tool-registry.service";

interface HistoryMessage {
  role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
  content: string;
}

interface ProviderToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface PlannedToolCall {
  id: string;
  name: string;
  arguments: string;
  promptVersionId?: string;
}

@Injectable()
export class LlmGatewayService {
  constructor(@Optional() private readonly evaluation?: EvaluationService) {}

  isConfigured() {
    return Boolean(process.env.LLM_API_KEY?.trim());
  }

  async requestToolCall(params: {
    content: string;
    history: HistoryMessage[];
    tools: RegisteredToolDefinition[];
    signal?: AbortSignal;
  }): Promise<PlannedToolCall> {
    const activePrompt = await this.evaluation?.getActivePrompt();
    const payload = await this.requestJson(
      {
        messages: [
          {
            role: "system",
            content: activePrompt?.content ?? defaultPlanningPrompt()
          },
          ...toProviderHistory(params.history),
          { role: "user", content: params.content }
        ],
        tools: params.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        })),
        tool_choice: "required",
        stream: false,
        temperature: 0.1
      },
      params.signal
    );

    const message = payload.choices?.[0]?.message;
    const calls = message?.tool_calls ?? [];
    if (calls.length !== 1) {
      throw new LlmRuntimeError(
        calls.length > 1 ? "TOOL_STEP_LIMIT_EXCEEDED" : "MODEL_DID_NOT_CALL_TOOL",
        `Expected exactly one tool call, received ${calls.length}`
      );
    }

    const call = calls[0];
    if (!call.id || call.type !== "function" || !call.function?.name) {
      throw new LlmRuntimeError("TOOL_CALL_MALFORMED", "Model returned a malformed tool call");
    }
    return {
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments ?? "{}",
      promptVersionId: activePrompt?.id
    };
  }

  async streamAnswer(params: {
    content: string;
    history: HistoryMessage[];
    toolCall: PlannedToolCall;
    toolOutput: Record<string, unknown>;
    onDelta: (delta: string) => void;
    signal?: AbortSignal;
  }) {
    const config = readLlmConfig();
    const activePrompt = await this.evaluation?.getActivePrompt();
    const requestSignal = createRequestSignal(params.signal, 20_000);
    try {
      const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
        method: "POST",
        headers: providerHeaders(config.apiKey),
        signal: requestSignal.signal,
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: "system",
              content: `${activePrompt?.content ?? defaultPlanningPrompt()}\n\n${answerFormattingPrompt()}`
            },
            ...toProviderHistory(params.history),
            { role: "user", content: params.content },
            {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: params.toolCall.id,
                  type: "function",
                  function: {
                    name: params.toolCall.name,
                    arguments: params.toolCall.arguments
                  }
                }
              ]
            },
            {
              role: "tool",
              tool_call_id: params.toolCall.id,
              content: JSON.stringify(params.toolOutput)
            }
          ],
          tool_choice: "none",
          stream: true,
          temperature: 0.3
        })
      });

      if (!response.ok || !response.body) {
        throw new LlmRuntimeError("LLM_STREAM_FAILED", `LLM stream failed with HTTP ${response.status}`);
      }
      const answer = await readOpenAiSse(response, params.onDelta, requestSignal.signal);
      if (!answer.trim()) {
        throw new LlmRuntimeError("LLM_EMPTY_ANSWER", "LLM stream returned no answer");
      }
      return answer;
    } catch (error) {
      throw normalizeRequestAbort(error, requestSignal, params.signal);
    } finally {
      requestSignal.cleanup();
    }
  }

  private async requestJson(body: Record<string, unknown>, signal?: AbortSignal) {
    const config = readLlmConfig();
    const requestSignal = createRequestSignal(signal, 15_000);
    try {
      const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
        method: "POST",
        headers: providerHeaders(config.apiKey),
        signal: requestSignal.signal,
        body: JSON.stringify({ model: config.model, ...body })
      });
      if (!response.ok) {
        throw new LlmRuntimeError("LLM_REQUEST_FAILED", `LLM request failed with HTTP ${response.status}`);
      }
      return (await response.json()) as {
        choices?: Array<{ message?: { tool_calls?: ProviderToolCall[] } }>;
      };
    } catch (error) {
      throw normalizeRequestAbort(error, requestSignal, signal);
    } finally {
      requestSignal.cleanup();
    }
  }
}

export async function readOpenAiSse(response: Response, onDelta: (delta: string) => void, signal?: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new LlmRuntimeError("LLM_STREAM_UNAVAILABLE", "Response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";

  const consumeEvent = (event: string) => {
    for (const line of event.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let parsed: { choices?: Array<{ delta?: { content?: string | null } }> };
      try {
        parsed = JSON.parse(data);
      } catch {
        throw new LlmRuntimeError("LLM_STREAM_INVALID_JSON", "LLM stream returned invalid JSON");
      }
      const delta = parsed.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        answer += delta;
        onDelta(delta);
      }
    }
  };

  while (true) {
    if (signal?.aborted) {
      await reader.cancel();
      throw new LlmRuntimeError("LLM_ABORTED", "LLM request was aborted");
    }
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    buffer = buffer.replace(/\r\n/g, "\n");
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) consumeEvent(event);
    if (done) {
      if (buffer.trim()) consumeEvent(buffer);
      break;
    }
  }

  return answer;
}

export class LlmRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "LlmRuntimeError";
  }
}

export function readLlmConfig() {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("LLM_API_KEY 未配置");
  }
  return {
    apiKey,
    baseUrl: process.env.LLM_BASE_URL?.trim() || "https://api.deepseek.com",
    model: process.env.LLM_MODEL?.trim() || "deepseek-chat"
  };
}

function defaultPlanningPrompt() {
  return [
    "你是消费金融客服 Agent。你不能直接查询数据库，也不能编造业务事实。",
    "每轮必须且只能调用一个提供的工具。借款进度调用 queryLoanStatus；还款问题调用 queryRepaymentRecord；用户要求人工、投诉、越界问题或无法判断时调用 createSupportTicket。",
    "不要在工具参数中传入 userId、SQL、代码、URL 或密钥。"
  ].join("\n");
}

function answerFormattingPrompt() {
  return "只能基于工具结果回答，不得编造。使用中文并分为业务事实、处理建议、风险提示三部分。";
}

function providerHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function toProviderHistory(history: HistoryMessage[]) {
  return history.slice(-8).map((message) => ({
    role: message.role === "USER" ? "user" : message.role === "ASSISTANT" ? "assistant" : "system",
    content: message.content
  }));
}

function createRequestSignal(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (parent?.aborted) controller.abort();
  parent?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    }
  };
}

function normalizeRequestAbort(error: unknown, requestSignal: ReturnType<typeof createRequestSignal>, parent?: AbortSignal) {
  if (requestSignal.timedOut()) {
    return new LlmRuntimeError("LLM_TIMEOUT", "LLM request timed out");
  }
  if (parent?.aborted || (error instanceof Error && error.name === "AbortError")) {
    return new LlmRuntimeError("LLM_ABORTED", "LLM request was aborted");
  }
  return error;
}
