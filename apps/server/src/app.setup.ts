import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { HttpExceptionFilter } from "./common/http-exception.filter";

export function configureApp(app: INestApplication) {
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5000",
    credentials: true
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header("x-request-id") ?? `req_${randomUUID()}`;
    req.headers["x-request-id"] = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle("FinServe AI API")
    .setDescription("消费金融智能客服与工单协同平台 MVP")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
}
