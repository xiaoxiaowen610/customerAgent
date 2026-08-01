import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@finserve/shared-types";
import { ROLES_KEY } from "./roles.decorator";
import type { RequestUser } from "../common/current-user.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!roles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!request.user || !roles.includes(request.user.role)) {
      throw new ForbiddenException("没有权限访问该资源");
    }
    return true;
  }
}
