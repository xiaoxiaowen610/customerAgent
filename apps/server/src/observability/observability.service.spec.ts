import { describe, expect, it } from "vitest";
import { calculateMetrics } from "./observability.service";

describe("calculateMetrics", () => {
  it("calculates rates, average and nearest-rank p95", () => {
    const runs = Array.from({ length: 20 }, (_, index) => ({
      status: index < 12 ? "COMPLETED" : index < 16 ? "ESCALATED" : "FAILED",
      latencyMs: (index + 1) * 100
    }));
    expect(calculateMetrics(runs, [{ status: "SUCCESS" }, { status: "FAILED" }], 3)).toEqual({
      requestCount: 20,
      completionRate: 0.6,
      escalationRate: 0.2,
      toolSuccessRate: 0.5,
      averageLatencyMs: 1050,
      p95LatencyMs: 1900,
      openTickets: 3
    });
  });

  it("returns zero rates for an empty sample", () => {
    expect(calculateMetrics([], [], 0)).toMatchObject({ requestCount: 0, completionRate: 0, p95LatencyMs: 0 });
  });
});
