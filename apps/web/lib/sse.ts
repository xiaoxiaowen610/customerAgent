export type SseHandler = (event: string, data: Record<string, unknown>) => void;

export async function readSse(response: Response, onEvent: SseHandler, signal?: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("响应不支持流式读取");
  }
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) {
      await reader.cancel();
      throw new DOMException("请求已取消", "AbortError");
    }
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    buffer = buffer.replace(/\r\n/g, "\n");
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      dispatchPart(part, onEvent);
    }
    if (done) {
      if (buffer.trim()) {
        dispatchPart(buffer, onEvent);
      }
      break;
    }
  }
}

function dispatchPart(part: string, onEvent: SseHandler) {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of part.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!dataLines.length) return;

  try {
    onEvent(event, JSON.parse(dataLines.join("\n")) as Record<string, unknown>);
  } catch {
    throw new Error(`SSE_${event.toUpperCase()}_INVALID_JSON`);
  }
}
