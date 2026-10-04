import { scriptPrisma, seedBase } from './base-data.js';

const prisma = scriptPrisma();
seedBase(prisma)
  .then(() => process.stdout.write('base seed applied\n'))
  .catch((e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
