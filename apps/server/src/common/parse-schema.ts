import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException("请求参数不正确");
  }
  return parsed.data;
}
