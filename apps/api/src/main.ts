import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadEnv } from './config/env.js';
import { JsonLogger } from './common/logger.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new JsonLogger(env.LOG_LEVEL),
    bodyParser: true,
  });
  configureApp(app, env);
  app.enableShutdownHooks();

  if (env.OPENAPI_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle('HEDAX API')
      .setDescription('Auto parts store and custom sourcing platform — REST API v1')
      .setVersion('1.0.0')
      .addCookieAuth('hedax_sid')
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config));
  }

  await app.listen(env.PORT, '0.0.0.0');
}

bootstrap().catch((err: unknown) => {
  process.stderr.write(`${JSON.stringify({ level: 'fatal', msg: err instanceof Error ? err.message : String(err) })}\n`);
  process.exit(1);
});
