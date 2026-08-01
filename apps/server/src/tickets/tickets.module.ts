import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminTicketsController } from "./tickets.admin.controller";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [TicketsController, AdminTicketsController],
  providers: [TicketsService],
  exports: [TicketsService]
})
export class TicketsModule {}
