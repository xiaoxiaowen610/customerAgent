import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { AuthService } from "./auth.service";
import type { RequestUser } from "../common/current-user.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: RequestUser }>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      throw new UnauthorizedException("未登录");
    }

    try {
      request.user = jwt.verify(token, this.authService.jwtSecret) as RequestUser;
      return true;
    } catch {
      throw new UnauthorizedException("登录已过期");
    }
  }
}
