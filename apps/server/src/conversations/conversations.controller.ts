import { Body, Controller, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { SendMessageSchema } from "@finserve/shared-types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../common/current-user.decorator";
import { parseBody } from "../common/parse-schema";
import { ConversationsService } from "./conversations.service";

@ApiTags("conversations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("conversations")
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  create(@CurrentUser() user: RequestUser) {
    return this.conversations.create(user);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.conversations.list(user);
  }

  @Get(":id/messages")
  messages(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.conversations.messages(user, id);
  }

  @Post(":id/messages")
  async send(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() response: Response
  ) {
    const input = parseBody(SendMessageSchema, body);
    const abortController = new AbortController();
    let finished = false;
    response.on("close", () => {
      if (!finished) {
        abortController.abort();
      }
    });
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders?.();

    const emit = (event: "status" | "tool" | "message" | "done" | "error", data: unknown) => {
      response.write(`event: ${event}\n`);
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await this.conversations.sendMessage({
        user,
        conversationId: id,
        content: input.content,
        emit,
        signal: abortController.signal
      });
    } catch (error) {
      emit("error", {
        message: error instanceof Error ? error.message : "消息处理失败"
      });
    } finally {
      finished = true;
      response.end();
    }
  }
}
