// Offline tests for the Down or Me cron cycle: when Jev triage is retried and when an email goes out.
// No network: D1 is node:sqlite in memory running the real migrations, fetch and the clock are faked,
// and `cloudflare:sockets` is stubbed (the Minecraft check is not exercised here).
//   node worker/test-down-or-me.mjs        (Node 22+, for node:sqlite)
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import assert from "node:assert/strict";

register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === "cloudflare:sockets") return { url: "data:text/javascript,export const connect = () => { throw new Error('no sockets in tests'); };", shortCircuit: true };
    return next(spec, ctx);
  }`));
const worker = (await import("./src/index.js")).default;

const here = new URL(".", import.meta.url);
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(new URL("migrations/", here)).sort()) db.exec(readFileSync(new URL(`migrations/${f}`, here), "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (ss) => Promise.all(ss.map((s) => s.run())), raw: db };
}

// Fake world: GitHub is down, everything else is up. Jev answers per `jev` mode.
function world() {
  const w = { jev: "fail", jevCalls: 0, emails: 0, clock: Date.UTC(2026, 9, 18, 12, 0) };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/v1/systemone")) {
      w.jevCalls++;
      if (w.jev === "fail") return new Response("upstream error", { status: 500 });
      return Response.json({ model: "jev-test", answers: { cause: { choice: "real_outage", confidence: 0.95 }, notify: { noul: 0.95 } } });
    }
    if (u.includes("api.resend.com")) { w.emails++; return Response.json({ id: "e1" }); }
    if (u.startsWith("https://github.com")) return new Response("down", { status: 503 });
    if (u.includes("generate_204")) return new Response(null, { status: 204 });
    return new Response("ok", { status: 200 });
  };
  Date.now = () => w.clock;
  return w;
}
const env = (o = {}) => ({ DB: fakeD1(), JEV_API_KEY: "test", RESEND_API_KEY: "test", NOTIFY_FROM: "a@example.com", NOTIFY_TO: "b@example.com", ...o });
const cycle = async (e) => { let p; await worker.scheduled({}, e, { waitUntil: (x) => (p = x) }); await p; };
const MIN = 60_000;
const origError = console.error; console.error = () => {};

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log(`ok - ${name}`); };

await test("a failed Jev call is retried after JEV_RECHECK_MIN, not never", async () => {
  const w = world(); const e = env();
  await cycle(e);                       // GitHub goes down; Jev fails
  assert.equal(w.jevCalls, 1); assert.equal(w.emails, 0);
  w.clock += 5 * MIN; await cycle(e);   // still down, inside the recheck window: no new call
  assert.equal(w.jevCalls, 1);
  w.jev = "ok"; w.clock += 30 * MIN; await cycle(e); // past the window: retried, confident outage -> email
  assert.equal(w.jevCalls, 2); assert.equal(w.emails, 1);
  w.clock += 35 * MIN; await cycle(e); // asked again later, but already notified for this episode
  assert.equal(w.jevCalls, 3); assert.equal(w.emails, 1);
});

await test("a problem first seen with the daily cap used up is triaged once budget is back", async () => {
  const w = world(); w.jev = "ok"; const e = env({ JEV_DAILY_CAP: "1" });
  const day = new Date(w.clock).toISOString().slice(0, 10);
  e.DB.raw.prepare("INSERT INTO budget (day, jev_calls) VALUES (?, 1)").run(day);
  await cycle(e);                       // down, but no budget: board only
  assert.equal(w.jevCalls, 0);
  e.DB.raw.prepare("UPDATE budget SET jev_calls = 0 WHERE day = ?").run(day);
  w.clock += 5 * MIN; await cycle(e);   // budget available again: triaged on the next cycle
  assert.equal(w.jevCalls, 1); assert.equal(w.emails, 1);
});

await test("a healthy cycle makes no Jev calls and sends nothing", async () => {
  const w = world(); const e = env();
  globalThis.fetch = async (url) => (String(url).includes("generate_204") ? new Response(null, { status: 204 }) : new Response("ok"));
  await cycle(e); w.clock += 5 * MIN; await cycle(e);
  assert.equal(w.jevCalls, 0); assert.equal(w.emails, 0);
});

console.error = origError;
console.log(`\n${n} tests passed`);
