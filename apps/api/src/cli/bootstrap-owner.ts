import argon2 from 'argon2';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { passwordProblems } from '@hedax/domain/server';
import { scriptPrisma, seedBase } from '../database/base-data.js';

/**
 * One-time creation of the first owner (spec §14). Refuses when an active owner
 * already exists. The password is read from HEDAX_OWNER_PASSWORD or an
 * interactive prompt — never from command-line arguments or a seed file.
 * MFA enrollment is forced at the first sign-in (owner role requires MFA).
 *
 *   pnpm --filter @hedax/api owner:bootstrap -- --email owner@example.com --name "Owner Name"
 */
async function main(): Promise<void> {
  const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) throw new Error('Usage: owner:bootstrap -- --email <email> --name <full name>');

  let password = process.env.HEDAX_OWNER_PASSWORD ?? '';
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    password = await rl.question('Owner password (min 12 chars): ');
    rl.close();
  }
  const problems = passwordProblems(password, [email, name]);
  if (problems.length) throw new Error(`Weak password: ${problems.join(', ')}`);

  const prisma = scriptPrisma();
  try {
    await seedBase(prisma);
    const ownerRole = await prisma.role.findFirstOrThrow({ where: { isOwner: true } });
    const existingOwner = await prisma.userRole.findFirst({ where: { roleId: ownerRole.id, user: { status: 'ACTIVE' } } });
    if (existingOwner) {
      throw new Error(
        'An owner already exists. To hand over ownership, the current owner invites the new owner in the panel (Staff → invite with the Owner role, confirmed with a current authenticator code); the previous owner can then be removed.',
      );
    }
    if (await prisma.user.findUnique({ where: { email } })) throw new Error('This email is already in use.');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { kind: 'STAFF', email, fullName: name, passwordHash } });
      await tx.userRole.create({ data: { userId: u.id, roleId: ownerRole.id } });
      await tx.auditLog.create({ data: { actorKind: 'SYSTEM', action: 'owner.bootstrapped', entityType: 'user', entityId: u.id, after: { email } } });
      return u;
    });
    process.stdout.write(`Owner created (${user.id}). Sign in at /fa/staff/login — MFA enrollment is required on first sign-in.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
