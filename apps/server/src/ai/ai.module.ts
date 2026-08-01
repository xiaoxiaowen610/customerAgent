import { forwardRef, Module } from "@nestjs/common";
import { TicketsModule } from "../tickets/tickets.module";
import { AiOrchestratorService } from "./ai-orchestrator.service";
import { LlmGatewayService } from "./llm-gateway.service";
import { ToolRegistryService } from "./tool-registry.service";

@Module({
  imports: [forwardRef(() => TicketsModule)],
  providers: [AiOrchestratorService, LlmGatewayService, ToolRegistryService],
  exports: [AiOrchestratorService]
})
export class AiModule {}
