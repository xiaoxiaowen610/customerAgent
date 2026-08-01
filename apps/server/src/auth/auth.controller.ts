import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { LoginSchema } from "@finserve/shared-types";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { parseBody } from "../common/parse-schema";
import type { RequestUser } from "../common/current-user.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  async login(@Body() body: unknown) {
    const input = parseBody(LoginSchema, body);
    return this.authService.login(input.email, input.password);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() request: { user: RequestUser }) {
    return { user: request.user };
  }
}
