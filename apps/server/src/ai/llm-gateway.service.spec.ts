import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmGatewayService, readLlmConfig, readOpenAiSse } from "./llm-gateway.service";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("server-side LLM configuration", () => {
  it("requires a server-side API key", () => {
    delete process.env.LLM_API_KEY;
    expect(() => readLlmConfig()).toThrow("LLM_API_KEY 未配置");
  });

  it("uses deployment-controlled provider settings", () => {
    process.env.LLM_API_KEY = "unit-test-api-key";
    process.env.LLM_BASE_URL = "https://llm.example.com";
    process.env.LLM_MODEL = "interview-model";
    expect(readLlmConfig()).toEqual({
      apiKey: "unit-test-api-key",
      baseUrl: "https://llm.example.com",
      model: "interview-model"
    });
  });
});

describe("native tool call planning", () => {
  it("parses exactly one function tool call", async () => {
    process.env.LLM_API_KEY = "unit-test-api-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "queryLoanStatus", arguments: "{}" }
                  }
                ]
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const gateway = new LlmGatewayService();
    const call = await gateway.requestToolCall({
      content: "查询借款",
      history: [],
      tools: [
        {
          name: "queryLoanStatus",
          description: "query",
          parameters: { type: "object", properties: {} }
        }
      ]
    });
    expect(call).toEqual({ id: "call_1", name: "queryLoanStatus", arguments: "{}" });
  });

  it("enforces the single-tool step limit", async () => {
    process.env.LLM_API_KEY = "unit-test-api-key";
    const call = (id: string) => ({
      id,
      type: "function",
      function: { name: "queryLoanStatus", arguments: "{}" }
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { tool_calls: [call("1"), call("2")] } }] }), {
        status: 200
      })
    );
    const gateway = new LlmGatewayService();
    await expect(
      gateway.requestToolCall({ content: "查询", history: [], tools: [] })
    ).rejects.toMatchObject({ code: "TOOL_STEP_LIMIT_EXCEEDED" });
  });

  it("turns provider timeouts into an auditable runtime code", async () => {
    vi.useFakeTimers();
    process.env.LLM_API_KEY = "unit-test-api-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        })
    );
    const gateway = new LlmGatewayService();
    const pending = gateway.requestToolCall({ content: "查询", history: [], tools: [] });
    const assertion = expect(pending).rejects.toMatchObject({ code: "LLM_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
    vi.useRealTimers();
  });
});

describe("OpenAI-compatible streaming", () => {
  it("joins partial CRLF packets without losing deltas", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"choices":[{"delta":{"content":"业务"}}]}\r',
      '\n\r\ndata: {"choices":[{"delta":{"content":"事实"}}]}\r\n\r\n',
      "data: [DONE]\r\n\r\n"
    ];
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        }
      })
    );
    const deltas: string[] = [];
    const answer = await readOpenAiSse(response, (delta) => deltas.push(delta));
    expect(answer).toBe("业务事实");
    expect(deltas).toEqual(["业务", "事实"]);
  });

  it("rejects invalid stream JSON", async () => {
    const response = new Response("data: {not-json}\n\n");
    await expect(readOpenAiSse(response, vi.fn())).rejects.toMatchObject({ code: "LLM_STREAM_INVALID_JSON" });
  });

  it("consumes a final event even without a trailing blank line", async () => {
    const response = new Response('data: {"choices":[{"delta":{"content":"尾包"}}]}');
    await expect(readOpenAiSse(response, vi.fn())).resolves.toBe("尾包");
  });
});
