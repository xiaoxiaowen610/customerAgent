import { describe, expect, it } from "vitest";
import { assertTicketTransition, buildTicketIdempotencyKey } from "./ticket-state";

describe("ticket state machine", () => {
  it("allows the MVP happy-path transitions", () => {
    expect(() => assertTicketTransition("PENDING", "PROCESSING")).not.toThrow();
    expect(() => assertTicketTransition("PROCESSING", "WAITING_USER")).not.toThrow();
    expect(() => assertTicketTransition("WAITING_USER", "PROCESSING")).not.toThrow();
    expect(() => assertTicketTransition("PROCESSING", "RESOLVED")).not.toThrow();
    expect(() => assertTicketTransition("RESOLVED", "CLOSED")).not.toThrow();
  });

  it("rejects illegal jumps", () => {
    expect(() => assertTicketTransition("PENDING", "RESOLVED")).toThrow("Invalid ticket transition");
    expect(() => assertTicketTransition("CLOSED", "PROCESSING")).toThrow("Invalid ticket transition");
  });
});

describe("ticket idempotency", () => {
  it("keeps duplicate escalations for one conversation on the same key", () => {
    expect(buildTicketIdempotencyKey("user_1", "conv_1")).toBe("user_1:conv_1:ai-escalation-v1");
  });
});
