import { z } from "zod";

export const roles = ["USER", "AGENT", "ADMIN"] as const;
export type Role = (typeof roles)[number];

export const conversationStatuses = ["ACTIVE", "TRANSFERRED_TO_HUMAN", "CLOSED"] as const;
export type ConversationStatus = (typeof conversationStatuses)[number];

export const messageRoles = ["USER", "ASSISTANT", "SYSTEM", "TOOL"] as const;
export type MessageRole = (typeof messageRoles)[number];

export const ticketStatuses = ["PENDING", "PROCESSING", "WAITING_USER", "RESOLVED", "CLOSED"] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

export const ticketPriorities = ["LOW", "MEDIUM", "HIGH"] as const;
export type TicketPriority = (typeof ticketPriorities)[number];

export const intents = ["loan_status", "repayment_failed", "unknown"] as const;
export type Intent = (typeof intents)[number];

export const IntentResultSchema = z.object({
  intent: z.enum(intents),
  confidence: z.number().min(0).max(1),
  needHuman: z.boolean(),
  reason: z.string().max(500)
});

export type IntentResult = z.infer<typeof IntentResultSchema>;

export const LlmConfigSchema = z.object({
  apiKey: z.string().trim().min(1).max(200),
  baseUrl: z.string().trim().url().max(200).optional(),
  model: z.string().trim().min(1).max(80).optional()
});

export type LlmConfig = z.infer<typeof LlmConfigSchema>;

export const SendMessageSchema = z.object({
  content: z.string().trim().min(1).max(1000),
  llmConfig: LlmConfigSchema.optional()
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const TicketStatusSchema = z.enum(ticketStatuses);

export const allowedTicketTransitions: Record<TicketStatus, TicketStatus[]> = {
  PENDING: ["PROCESSING", "CLOSED"],
  PROCESSING: ["WAITING_USER", "RESOLVED"],
  WAITING_USER: ["PROCESSING"],
  RESOLVED: ["CLOSED"],
  CLOSED: []
};

export function canTransitionTicket(from: TicketStatus, to: TicketStatus) {
  return allowedTicketTransitions[from].includes(to);
}

export type SseEventName = "status" | "tool" | "message" | "done" | "error";

export interface SseEvent<T = unknown> {
  event: SseEventName;
  data: T;
}
