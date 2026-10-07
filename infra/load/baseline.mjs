#!/usr/bin/env node
// Load baseline for a running HEDAX stack (docs/DEPLOYMENT.md §5, docs/TEST_REPORT.md).
//
//   node infra/load/baseline.mjs https://shop.example.ir [--duration 20] [--connections 10,50] [--insecure]
//
// Sends anonymous GET requests only (no sign-in, orders or uploads) to the main public pages
// and one public API read, one target at a time, and prints a Markdown table: requests per
// second, latency p50/p90/p99, non-2xx answers and errors. Search is limited per client IP
// (120 a minute): the search page uses one fixed query, which the shared public cache answers
// after the first request. --insecure accepts a local test certificate (Caddy on localhost).
// autocannon is installed once into a temporary folder (pinned version), not into the project.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AUTOCANNON = '8.0.0';
const args = process.argv.slice(2);
const base = args.find((a) => /^https?:\/\//.test(a));
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
if (!base) {
  process.stderr.write('usage: node infra/load/baseline.mjs <https://site> [--duration 20] [--connections 10,50] [--insecure]\n');
  process.exit(2);
}
const duration = Number(option('--duration', '20'));
const levels = option('--connections', '10,50').split(',').map(Number);
if (args.includes('--insecure')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const targets = [
  ['home page', '/fa'],
  ['search page', `/fa/parts?q=${encodeURIComponent('فیلتر')}`],
  ['product page', '/fa/parts/demo-demo-0002'],
  ['catalog API (JSON)', '/api/v1/catalog/products?pageSize=20&currency=IRR'],
];

const dir = path.join(tmpdir(), `hedax-autocannon-${AUTOCANNON}`);
const entry = path.join(dir, 'node_modules', 'autocannon', 'autocannon.js');
if (!existsSync(entry)) {
  mkdirSync(dir, { recursive: true });
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-save', '--prefix', dir, `autocannon@${AUTOCANNON}`], { stdio: 'inherit', shell: process.platform === 'win32' });
}
const { default: autocannon } = await import(pathToFileURL(entry).href);

const rows = [];
for (const [name, p] of targets) {
  for (const connections of levels) {
    const r = await autocannon({ url: new URL(p, base).href, connections, duration, headers: { 'accept-language': 'fa' } });
    rows.push({ name, connections, rps: Math.round(r.requests.average), p50: r.latency.p50, p90: r.latency.p90, p99: r.latency.p99, ok: r['2xx'], non2xx: r.non2xx, errors: r.errors + r.timeouts });
    process.stderr.write(`done: ${name}, ${connections} connections\n`);
  }
}
const out = (line) => process.stdout.write(`${line}\n`);
out(`\n${new Date().toISOString()}  ${base}  ${duration} s per row, anonymous GET only\n`);
out('| target | connections | requests/s | p50 ms | p90 ms | p99 ms | 2xx | non-2xx | errors/timeouts |');
out('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const x of rows) out(`| ${x.name} | ${x.connections} | ${x.rps} | ${x.p50} | ${x.p90} | ${x.p99} | ${x.ok} | ${x.non2xx} | ${x.errors} |`);
