// Uptime check for the live site, run from GitHub (outside the server and outside its network).
// Every INTERVAL_S seconds for DURATION_MIN minutes it fetches the storefront and the public API. After
// FAIL_AFTER failed rounds in a row the site counts as down and one Bale message goes to the owner; the
// first good round after that sends one "back up" message with the length of the outage. The state
// (up/down and since when) is kept in STATE_FILE, which the workflow carries from run to run.
//
// Environment: SITE_URL, API_URL, BALE_TOKEN, BALE_CHAT_ID (both optional: without them nothing is
// sent and the run says so), BALE_API (default https://tapi.bale.ai), STATE_FILE, DURATION_MIN,
// INTERVAL_S, FAIL_AFTER, TIMEOUT_MS, RETRY_MS, TEST_MESSAGE=1 (send one test message and stop), SUMMARY (a file for notes).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const env = process.env;
const SITE_URL = env.SITE_URL || 'https://sourcebyhedax.ir/fa';
const API_URL = env.API_URL || 'https://sourcebyhedax.ir/api/v1/site/content';
const BALE_API = (env.BALE_API || 'https://tapi.bale.ai').replace(/\/$/, '');
const STATE_FILE = env.STATE_FILE || 'uptime-state.json';
const DURATION_MIN = Number(env.DURATION_MIN || 28);
const INTERVAL_S = Number(env.INTERVAL_S || 60);
const FAIL_AFTER = Number(env.FAIL_AFTER || 2);
const TIMEOUT_MS = Number(env.TIMEOUT_MS || 20000);
const RETRY_MS = Number(env.RETRY_MS || 5000);

const note = (line) => {
  console.log(line);
  if (env.SUMMARY) appendFileSync(env.SUMMARY, `${line}\n`);
};
const tehran = (ms) => new Date(ms).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'short', timeStyle: 'short' });
const minutes = (ms) => Math.max(1, Math.round(ms / 60000)).toLocaleString('fa-IR');

function loadState() {
  try {
    if (existsSync(STATE_FILE)) return { up: true, since: Date.now(), fails: 0, ...JSON.parse(readFileSync(STATE_FILE, 'utf8')) };
  } catch {
    // A damaged state file counts as "up since now".
  }
  return { up: true, since: Date.now(), fails: 0 };
}
const saveState = (s) => writeFileSync(STATE_FILE, JSON.stringify(s));

/** One endpoint: a 200 with the expected body within the timeout; one quick retry before it counts. */
async function probe(url, expect) {
  let last = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'source-uptime-check', 'Cache-Control': 'no-cache' }, redirect: 'follow' });
      const body = await res.text();
      if (res.status === 200 && expect(body)) return { ok: true };
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e?.name === 'TimeoutError' ? 'timeout' : (e?.cause?.code || e?.message || 'network error');
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, RETRY_MS));
  }
  return { ok: false, why: last };
}

async function round() {
  const [site, api] = await Promise.all([
    probe(SITE_URL, (b) => /<html/i.test(b)),
    probe(API_URL, (b) => b.trim().startsWith('{')),
  ]);
  return { ok: site.ok && api.ok, site, api };
}

async function send(text) {
  if (!env.BALE_TOKEN || !env.BALE_CHAT_ID) {
    // Nothing could be sent anyway: the change of state still counts, so it is not retried every round.
    note(`NOT SENT (MONITOR_BALE_TOKEN / MONITOR_BALE_CHAT_ID not set): ${text.replace(/\n/g, ' | ')}`);
    return env.TEST_MESSAGE !== '1';
  }
  try {
    const res = await fetch(`${BALE_API}/bot${env.BALE_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.BALE_CHAT_ID, text }),
      signal: AbortSignal.timeout(20000),
    });
    const ok = res.ok && (await res.json().catch(() => ({}))).ok !== false;
    note(ok ? `sent: ${text.replace(/\n/g, ' | ')}` : `Bale refused the message: HTTP ${res.status}`);
    return ok;
  } catch (e) {
    note(`Bale unreachable: ${e?.message || e}`);
    return false;
  }
}

const describe = (r) => [`سایت: ${r.site.ok ? 'سالم' : r.site.why}`, `API: ${r.api.ok ? 'سالم' : r.api.why}`].join('\n');

async function main() {
  if (env.TEST_MESSAGE === '1') {
    const r = await round();
    const sent = await send(`🧪 پیام آزمایشی پایش سایت سورس\n${describe(r)}\nزمان: ${tehran(Date.now())} (تهران)\nبررسی از بیرون سرور (GitHub)`);
    process.exit(sent ? 0 : 1);
  }
  const state = loadState();
  const end = Date.now() + DURATION_MIN * 60000;
  let rounds = 0;
  while (Date.now() < end) {
    const started = Date.now();
    const r = await round();
    rounds += 1;
    if (r.ok) {
      if (!state.up) {
        // "Back up" is sent once; if it cannot be sent it is tried again next round.
        if (await send(`🟢 سایت سورس دوباره در دسترس است.\nمدت قطعی: حدود ${minutes(started - state.since)} دقیقه\nزمان: ${tehran(started)} (تهران)`)) {
          Object.assign(state, { up: true, since: started, alerted: false });
        }
      }
      state.fails = 0;
    } else {
      state.fails = (state.fails || 0) + 1;
      if (state.up && state.fails >= FAIL_AFTER) {
        Object.assign(state, { up: false, since: started - (FAIL_AFTER - 1) * INTERVAL_S * 1000, alerted: false });
      }
      if (!state.up && !state.alerted) {
        state.alerted = await send(`🔴 سایت سورس از دسترس خارج شده است.\n${describe(r)}\nاز: ${tehran(state.since)} (تهران)\nبررسی از بیرون سرور (GitHub)، هر دقیقه`);
      }
    }
    saveState(state);
    note(`${new Date(started).toISOString()} ${r.ok ? 'UP' : 'FAIL'} site=${r.site.ok ? 'ok' : r.site.why} api=${r.api.ok ? 'ok' : r.api.why} state=${state.up ? 'up' : 'down'}`);
    const wait = INTERVAL_S * 1000 - (Date.now() - started);
    if (Date.now() + wait >= end) break;
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
  }
  note(`${rounds} rounds; state ${state.up ? 'up' : 'down'} since ${new Date(state.since).toISOString()}`);
}

await main();
