import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports readiness when PostgreSQL responds", async () => {
    const controller = new HealthController({ $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) } as any);
    await expect(controller.ready()).resolves.toMatchObject({ status: "ok", database: "up" });
  });

  it("returns 503 semantics when PostgreSQL is unavailable", async () => {
    const controller = new HealthController({ $queryRaw: vi.fn().mockRejectedValue(new Error("unavailable")) } as any);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
