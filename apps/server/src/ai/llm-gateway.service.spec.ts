import { afterEach, describe, expect, it } from "vitest";
import { readLlmConfig } from "./llm-gateway.service";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("server-side LLM configuration", () => {
  it("requires a server-side API key", () => {
    delete process.env.LLM_API_KEY;
    expect(() => readLlmConfig()).toThrow("LLM_API_KEY 未配置");
  });

  it("uses deployment-controlled provider settings", () => {
    process.env.LLM_API_KEY = "server-secret";
    process.env.LLM_BASE_URL = "https://llm.example.com";
    process.env.LLM_MODEL = "interview-model";

    expect(readLlmConfig()).toEqual({
      apiKey: "server-secret",
      baseUrl: "https://llm.example.com",
      model: "interview-model"
    });
  });
});
