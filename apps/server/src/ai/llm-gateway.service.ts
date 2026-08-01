import { Injectable } from "@nestjs/common";
import { IntentResult, IntentResultSchema } from "@finserve/shared-types";

interface HistoryMessage {
  role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
  content: string;
}

@Injectable()
export class LlmGatewayService {
  isConfigured() {
    return Boolean(process.env.LLM_API_KEY?.trim());
  }

  async analyzeIntent(params: {
    content: string;
    history: HistoryMessage[];
  }): Promise<IntentResult> {
    const content = await this.chatCompletion({
      messages: [
        {
          role: "system",
          content:
            "你是消费金融客服的意图识别器。只输出 JSON，不要输出 Markdown。字段固定为 intent、confidence、needHuman、reason。intent 只能是 loan_status、repayment_failed、unknown。confidence 必须是 0 到 1 的数字。needHuman 在用户明确要求人工、问题超出支持范围、或无法可靠判断时为 true。"
        },
        {
          role: "user",
          content: [
            "请基于以下对话上下文识别最后一条用户问题的意图。",
            "",
            "对话上下文：",
            this.toTranscript(params.history),
            "",
            "最后一条用户问题：",
            params.content
          ].join("\n")
        }
      ],
      jsonOutput: true,
      temperature: 0.1
    });

    return IntentResultSchema.parse(JSON.parse(content));
  }

  async generateAnswer(params: {
    content: string;
    history: HistoryMessage[];
    intent: IntentResult;
    toolOutput: Record<string, unknown>;
  }) {
    return this.chatCompletion({
      messages: [
        {
          role: "system",
          content:
            "你是消费金融客服助手。只能基于提供的业务事实回答，不能编造额外结论。回答必须使用中文，分成三行：业务事实：...\\n处理建议：...\\n风险提示：..."
        },
        {
          role: "user",
          content: [
            `当前意图：${params.intent.intent}`,
            "",
            "对话上下文：",
            this.toTranscript(params.history),
            "",
            `当前用户问题：${params.content}`,
            "",
            "可用业务事实（JSON）：",
            JSON.stringify(params.toolOutput, null, 2)
          ].join("\n")
        }
      ],
      temperature: 0.3
    });
  }

  private async chatCompletion(params: {
    messages: Array<{ role: "system" | "user"; content: string }>;
    jsonOutput?: boolean;
    temperature: number;
  }) {
    const config = readLlmConfig();
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: params.messages,
        stream: false,
        temperature: params.temperature,
        thinking: { type: "disabled" },
        ...(params.jsonOutput ? { response_format: { type: "json_object" } } : {})
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek 调用失败：HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("DeepSeek 未返回有效内容");
    }
    return content;
  }

  private toTranscript(history: HistoryMessage[]) {
    if (!history.length) {
      return "无";
    }
    return history
      .slice(-8)
      .map((message) => `${speakerLabel(message.role)}：${message.content}`)
      .join("\n");
  }
}

function normalizeBaseUrl(value?: string) {
  return (value?.trim() || "https://api.deepseek.com").replace(/\/+$/, "");
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

function speakerLabel(role: HistoryMessage["role"]) {
  if (role === "USER") return "用户";
  if (role === "ASSISTANT") return "助手";
  if (role === "SYSTEM") return "系统";
  return "工具";
}
