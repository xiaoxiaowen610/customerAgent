import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from "@nestjs/common";
import type { Request, Response } from "express";

interface ErrorPayload {
  code?: string;
  message?: string | string[];
  error?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : null;
    const normalized = normalizeExceptionPayload(payload, status);
    const requestId = String(request.headers["x-request-id"] ?? response.getHeader("x-request-id") ?? "unknown");

    if (status >= 500) {
      this.logger.error({
        requestId,
        method: request.method,
        path: request.originalUrl,
        error: exception instanceof Error ? exception.message : "unknown error"
      });
    }

    response.status(status).json({
      code: normalized.code,
      message: normalized.message,
      requestId
    });
  }
}

export function normalizeExceptionPayload(payload: unknown, status: number) {
  if (typeof payload === "string") {
    return { code: `HTTP_${status}`, message: payload };
  }

  const value = (payload && typeof payload === "object" ? payload : {}) as ErrorPayload;
  const rawMessage = value.message ?? value.error;
  const message = Array.isArray(rawMessage)
    ? rawMessage.join("；")
    : rawMessage ?? (status >= 500 ? "服务暂时不可用" : "请求处理失败");

  return {
    code: value.code ?? `HTTP_${status}`,
    message
  };
}
