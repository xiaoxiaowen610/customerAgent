import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ObservabilityService } from "./observability.service";

@ApiTags("admin metrics")
@ApiBearerAuth()
@Roles("AGENT", "ADMIN")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/metrics")
export class ObservabilityController {
  constructor(private readonly observability: ObservabilityService) {}

  @Get()
  getMetrics() {
    return this.observability.getMetrics();
  }
}
