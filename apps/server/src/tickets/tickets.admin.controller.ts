import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { TicketStatusSchema } from "@finserve/shared-types";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CurrentUser, RequestUser } from "../common/current-user.decorator";
import { parseBody } from "../common/parse-schema";
import { TicketsService } from "./tickets.service";

const ReplySchema = z.object({
  content: z.string().trim().min(1).max(1000),
  nextStatus: TicketStatusSchema.optional()
});

const StatusSchema = z.object({
  status: TicketStatusSchema
});

@ApiTags("admin tickets")
@ApiBearerAuth()
@Roles("AGENT", "ADMIN")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/tickets")
export class AdminTicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  list(@Query("status") status?: string, @Query("category") category?: string, @Query("q") q?: string) {
    return this.tickets.listForAgent({ status, category, q });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.tickets.getForAgent(id);
  }

  @Post(":id/replies")
  reply(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() body: unknown) {
    const input = parseBody(ReplySchema, body);
    return this.tickets.addAgentReply({
      ticketId: id,
      agentId: user.id,
      content: input.content,
      nextStatus: input.nextStatus
    });
  }

  @Patch(":id/status")
  updateStatus(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() body: unknown) {
    const input = parseBody(StatusSchema, body);
    return this.tickets.updateStatus(id, user.id, input.status);
  }
}
