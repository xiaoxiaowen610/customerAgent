import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CurrentUser, RequestUser } from "../common/current-user.decorator";
import { EvaluationService } from "./evaluation.service";

@ApiTags("agent evaluation")
@ApiBearerAuth()
@Roles("AGENT", "ADMIN")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/evaluation")
export class EvaluationController {
  constructor(private readonly evaluation: EvaluationService) {}

  @Get("dashboard")
  getDashboard() {
    return this.evaluation.getDashboard();
  }

  @Get("cases")
  listCases() {
    return this.evaluation.listCases();
  }

  @Post("cases")
  createCase(@Body() body: unknown) {
    return this.evaluation.createCase(body);
  }

  @Post("run-suite")
  runSuite() {
    return this.evaluation.runGoldenSuite();
  }

  @Get("prompts")
  listPrompts() {
    return this.evaluation.listPrompts();
  }

  @Post("prompts")
  createPrompt(@Body() body: unknown) {
    return this.evaluation.createPrompt(body);
  }

  @Post("prompts/:id/activate")
  activatePrompt(@Param("id") id: string) {
    return this.evaluation.activatePrompt(id);
  }

  @Post("runs/:aiRunId/score")
  scoreRun(@Param("aiRunId") aiRunId: string) {
    return this.evaluation.evaluateAndQueue(aiRunId);
  }

  @Get("reviews")
  listReviews(@Query("status") status?: string) {
    return this.evaluation.listReviews(status);
  }

  @Patch("reviews/:id")
  updateReview(@Param("id") id: string, @CurrentUser() user: RequestUser, @Body() body: unknown) {
    return this.evaluation.updateReview(id, user.id, body);
  }
}
