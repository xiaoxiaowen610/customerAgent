import { Module } from "@nestjs/common";
import { AiModule } from "./ai/ai.module";
import { AuthModule } from "./auth/auth.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TicketsModule } from "./tickets/tickets.module";

@Module({
  imports: [PrismaModule, AuthModule, TicketsModule, AiModule, ConversationsModule]
})
export class AppModule {}
