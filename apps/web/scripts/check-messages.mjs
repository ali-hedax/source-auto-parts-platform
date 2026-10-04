// Checks the interface texts (run by `pnpm typecheck`):
// 1. messages/fa.json and messages/en.json have exactly the same keys, so no
//    screen falls back to a raw key in one language;
// 2. every staff permission (packages/domain/src/rbac.ts) has a label in both
//    languages (`admin.perm_<key with _ for .>`), so the roles screen never
//    shows only a technical key to the owner (spec §13, §15);
// 3. every audit action and entity type recorded by the API has a label.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(readFileSync(path.join(webRoot, 'messages', file), 'utf8'));
const keys = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

const messages = { fa: read('fa.json'), en: read('en.json') };
const sets = { fa: new Set(keys(messages.fa)), en: new Set(keys(messages.en)) };
const problems = [];
for (const [a, b] of [['fa', 'en'], ['en', 'fa']]) {
  for (const key of sets[a]) if (!sets[b].has(key)) problems.push(`${key}: in ${a}.json but missing in ${b}.json`);
}

const rbac = readFileSync(path.resolve(webRoot, '../../packages/domain/src/rbac.ts'), 'utf8');
const block = /export const PERMISSIONS = \{([\s\S]*?)\} as const;/.exec(rbac)?.[1];
if (!block) problems.push('PERMISSIONS not found in packages/domain/src/rbac.ts');
const permissions = [...(block ?? '').matchAll(/^\s*'([a-z.]+)':/gm)].map((m) => m[1]);
if (block && permissions.length === 0) problems.push('no permission keys read from packages/domain/src/rbac.ts');
for (const permission of permissions) {
  const key = `admin.perm_${permission.replaceAll('.', '_')}`;
  for (const locale of ['fa', 'en']) if (!sets[locale].has(key)) problems.push(`${key}: no label in ${locale}.json for permission "${permission}"`);
}

// 3. Every audit action and entity type the API records has a label (admin › audit log).
const apiSrc = path.resolve(webRoot, '../api/src');
const sourceFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? (d.name === 'generated' ? [] : sourceFiles(path.join(dir, d.name))) : d.name.endsWith('.ts') ? [path.join(dir, d.name)] : [],
  );
// Actions built from a decision (`refund.${decision.toLowerCase()}`): the decisions are APPROVED or REJECTED.
const TEMPLATE_ACTIONS = { 'refund.': ['approved', 'rejected'], 'customer.group_': ['approved', 'rejected'] };
const actions = new Set();
const entities = new Set();
for (const file of sourceFiles(apiSrc)) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\baction: ([^,\n]+)/g)) {
    const expr = m[1];
    for (const lit of expr.matchAll(/'([a-z_]+(?:\.[a-z_]+)+)'/g)) actions.add(lit[1]);
    for (const tpl of expr.matchAll(/`([a-z_.]+)\$\{/g)) {
      const expansions = TEMPLATE_ACTIONS[tpl[1]];
      if (!expansions) problems.push(`${path.relative(apiSrc, file)}: computed audit action "${tpl[1]}…" — add its values to TEMPLATE_ACTIONS here`);
      else for (const e of expansions) actions.add(`${tpl[1]}${e}`);
    }
  }
  if (src.includes('audit')) for (const m of src.matchAll(/\bentityType: '([a-z_]+)'/g)) entities.add(m[1]);
}
if (actions.size === 0) problems.push('no audit actions read from apps/api/src');
for (const action of actions) {
  const key = `admin.auditAction_${action.replaceAll('.', '_')}`;
  for (const locale of ['fa', 'en']) if (!sets[locale].has(key)) problems.push(`${key}: no label in ${locale}.json for audit action "${action}"`);
}
for (const entity of entities) {
  const key = `admin.auditEntity_${entity}`;
  for (const locale of ['fa', 'en']) if (!sets[locale].has(key)) problems.push(`${key}: no label in ${locale}.json for audit entity "${entity}"`);
}

if (problems.length) {
  process.stderr.write(`Interface texts are incomplete:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`messages ok: ${sets.fa.size} keys in fa and en; ${permissions.length} permission labels; ${actions.size} audit actions and ${entities.size} entity types labelled\n`);
