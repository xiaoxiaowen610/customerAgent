import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { CurrentUser, RequestUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseBody } from "../common/parse-schema";
import { TicketsService } from "./tickets.service";

const CreateTicketSchema = z.object({
  conversationId: z.string().uuid().optional(),
  category: z.string().min(2).max(80).default("unknown"),
  reason: z.string().trim().min(1).max(1000)
});

const AddMessageSchema = z.object({
  content: z.string().trim().min(1).max(1000)
});

@ApiTags("tickets")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("tickets")
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const input = parseBody(CreateTicketSchema, body);
    return this.tickets.createManual({ userId: user.id, ...input, category: input.category ?? "unknown" });
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.tickets.listForUser(user.id);
  }

  @Get(":id")
  get(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tickets.getForUser(id, user.id);
  }

  @Post(":id/messages")
  addMessage(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() body: unknown) {
    const input = parseBody(AddMessageSchema, body);
    return this.tickets.addUserMessage(id, user.id, input.content);
  }
}
