import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ObservabilityController } from "./observability.controller";
import { ObservabilityService } from "./observability.service";

@Module({ imports: [AuthModule], controllers: [ObservabilityController], providers: [ObservabilityService] })
export class ObservabilityModule {}
