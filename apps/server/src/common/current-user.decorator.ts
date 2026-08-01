import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Role } from "@finserve/shared-types";

export interface RequestUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<{ user: RequestUser }>();
  return request.user;
});
