import { describe, expect, it, vi } from "vitest";
import { readSse } from "./sse";

describe("browser SSE parser", () => {
  it("handles half packets, CRLF and multiple events", async () => {
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('event: status\r\ndata: {"stage":"plan'));
          controller.enqueue(encoder.encode('ning"}\r\n\r\nevent: message\ndata: {"delta":"ok"}\n\n'));
          controller.close();
        }
      })
    );
    const handler = vi.fn();
    await readSse(response, handler);
    expect(handler).toHaveBeenNthCalledWith(1, "status", { stage: "planning" });
    expect(handler).toHaveBeenNthCalledWith(2, "message", { delta: "ok" });
  });

  it("rejects invalid event JSON", async () => {
    await expect(readSse(new Response("event: error\ndata: nope\n\n"), vi.fn())).rejects.toThrow(
      "SSE_ERROR_INVALID_JSON"
    );
  });

  it("honors an already aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readSse(new Response("data: {}\n\n"), vi.fn(), controller.signal)).rejects.toMatchObject({
      name: "AbortError"
    });
  });
});
