import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface RunMetric { status: string; latencyMs: number }
export interface ToolMetric { status: string }

export function calculateMetrics(runs: RunMetric[], tools: ToolMetric[], openTickets: number) {
  const completed = runs.filter((run) => run.status === "COMPLETED").length;
  const escalated = runs.filter((run) => run.status === "ESCALATED").length;
  const successfulTools = tools.filter((tool) => tool.status === "SUCCESS").length;
  const latencies = runs.map((run) => run.latencyMs).filter((value) => value >= 0).sort((a, b) => a - b);
  const averageLatencyMs = latencies.length
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : 0;
  const p95LatencyMs = latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1] : 0;
  return {
    requestCount: runs.length,
    completionRate: ratio(completed, runs.length),
    escalationRate: ratio(escalated, runs.length),
    toolSuccessRate: ratio(successfulTools, tools.length),
    averageLatencyMs,
    p95LatencyMs,
    openTickets
  };
}

@Injectable()
export class ObservabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics() {
    const [runs, tools, openTickets] = await Promise.all([
      this.prisma.aiRun.findMany({ orderBy: { createdAt: "desc" }, take: 500, select: { status: true, latencyMs: true } }),
      this.prisma.toolCallRecord.findMany({ orderBy: { createdAt: "desc" }, take: 1000, select: { status: true } }),
      this.prisma.ticket.count({ where: { status: { in: ["PENDING", "PROCESSING", "WAITING_USER"] } } })
    ]);
    return { ...calculateMetrics(runs, tools, openTickets), sample: { runs: runs.length, tools: tools.length } };
  }
}

function ratio(value: number, total: number) {
  return total ? Number((value / total).toFixed(4)) : 0;
}
