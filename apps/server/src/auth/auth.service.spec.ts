import { afterEach, describe, expect, it } from "vitest";
import { resolveJwtSecret } from "./auth.service";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("JWT configuration", () => {
  it("uses an explicitly configured secret", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "production-secret";
    expect(resolveJwtSecret()).toBe("production-secret");
  });

  it("rejects a missing secret in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    expect(() => resolveJwtSecret()).toThrow("必须配置 JWT_SECRET");
  });

  it("also requires an explicit secret during development", () => {
    process.env.NODE_ENV = "test";
    delete process.env.JWT_SECRET;
    expect(() => resolveJwtSecret()).toThrow("必须配置 JWT_SECRET");
  });
});
