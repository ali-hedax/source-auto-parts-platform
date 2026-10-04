import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module.js';

/** Writes docs/api/openapi.json without listening on a port or touching the database. */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
  const config = new DocumentBuilder()
    .setTitle('HEDAX API')
    .setDescription('Auto parts store and custom sourcing platform — REST API v1. Money is always { currency, amountMinor: string }.')
    .setVersion('1.0.0')
    .addCookieAuth('hedax_sid')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const out = path.resolve(process.cwd(), '../../docs/api/openapi.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(document, null, 2)}\n`);
  process.stdout.write(`OpenAPI written to ${out} (${Object.keys(document.paths).length} paths)\n`);
  await app.close();
  process.exit(0);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
