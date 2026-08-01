import { describe, expect, it } from "vitest";
import { IntentResultSchema } from "@finserve/shared-types";
import { analyzeIntent, shouldEscalateIntent } from "./intent";

describe("intent analysis", () => {
  it("returns a valid structured result for loan status", () => {
    const result = analyzeIntent("帮我查一下借款审核进度");
    expect(IntentResultSchema.safeParse(result).success).toBe(true);
    expect(result.intent).toBe("loan_status");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("returns a valid structured result for repayment failure", () => {
    const result = analyzeIntent("为什么还款失败了，是银行卡限额吗");
    expect(IntentResultSchema.safeParse(result).success).toBe(true);
    expect(result.intent).toBe("repayment_failed");
  });

  it("escalates low-confidence or unknown intents", () => {
    const result = analyzeIntent("这个活动资格怎么算");
    expect(result.intent).toBe("unknown");
    expect(shouldEscalateIntent(result)).toBe(true);
  });
});
