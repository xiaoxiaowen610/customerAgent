import { canTransitionTicket, TicketStatus } from "@finserve/shared-types";

export function assertTicketTransition(from: TicketStatus, to: TicketStatus) {
  if (!canTransitionTicket(from, to)) {
    throw new Error(`Invalid ticket transition: ${from} -> ${to}`);
  }
}

export function buildTicketIdempotencyKey(userId: string, conversationId: string, version = "ai-escalation-v1") {
  return `${userId}:${conversationId}:${version}`;
}
