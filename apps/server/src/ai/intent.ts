import { IntentResult, IntentResultSchema } from "@finserve/shared-types";

export function analyzeIntent(content: string): IntentResult {
  const text = content.toLowerCase();

  if (/(人工|客服|投诉|没人管)/.test(text)) {
    return IntentResultSchema.parse({
      intent: "unknown",
      confidence: 0.52,
      needHuman: true,
      reason: "用户明确表达需要人工介入"
    });
  }

  if (/(借款|贷款|申请|审核|进度|放款)/.test(text)) {
    return IntentResultSchema.parse({
      intent: "loan_status",
      confidence: 0.91,
      needHuman: false,
      reason: "问题包含借款申请或审核进度相关关键词"
    });
  }

  if (/(还款|扣款|失败|逾期|限额|银行卡)/.test(text)) {
    return IntentResultSchema.parse({
      intent: "repayment_failed",
      confidence: 0.88,
      needHuman: false,
      reason: "问题包含还款失败、扣款或银行卡限额相关关键词"
    });
  }

  return IntentResultSchema.parse({
    intent: "unknown",
    confidence: 0.41,
    needHuman: true,
    reason: "未命中 MVP 支持的两类高频意图"
  });
}

export function shouldEscalateIntent(result: IntentResult, toolExecutionFailed = false, noReliableEvidence = false) {
  return (
    result.needHuman ||
    result.intent === "unknown" ||
    result.confidence < 0.7 ||
    toolExecutionFailed ||
    noReliableEvidence
  );
}
