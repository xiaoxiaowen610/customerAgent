import { describe, expect, it } from "vitest";
import { normalizeExceptionPayload } from "./http-exception.filter";

describe("HTTP exception normalization", () => {
  it("keeps business messages while adding a stable code", () => {
    expect(normalizeExceptionPayload({ message: "不能访问他人的会话" }, 403)).toEqual({
      code: "HTTP_403",
      message: "不能访问他人的会话"
    });
  });

  it("does not expose unknown internal errors", () => {
    expect(normalizeExceptionPayload(null, 500)).toEqual({
      code: "HTTP_500",
      message: "服务暂时不可用"
    });
  });
});
