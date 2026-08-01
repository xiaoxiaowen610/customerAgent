import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  app.enableCors({
    origin: webOrigin,
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

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

bootstrap();
