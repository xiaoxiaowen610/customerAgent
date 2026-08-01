import { Module } from "@nestjs/common";
import { AiModule } from "./ai/ai.module";
import { AuthModule } from "./auth/auth.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TicketsModule } from "./tickets/tickets.module";
import { HealthModule } from "./health/health.module";
import { ObservabilityModule } from "./observability/observability.module";

@Module({
  imports: [PrismaModule, AuthModule, TicketsModule, AiModule, ConversationsModule, HealthModule, ObservabilityModule]
})
export class AppModule {}
