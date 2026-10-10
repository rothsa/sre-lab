// Offline tests for Plan B: validation, IP hashing, per-IP limit, daily caps, step detection and
// response hygiene. No network and no paid calls: D1 is node:sqlite in memory running the real
// migration, and the AI binding is a fake that records the steps it was given.
//   node worker/test-planb.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { validateBody, hashIp, takeIpSlot, takeDaily, limits, identify, buildSteps, MODELS, utcDay } from "./src/planb.js";
import { onRequest } from "../functions/api/planb.js";

const here = new URL(".", import.meta.url);
const FAKE_KEY = "sk-test-NOT-A-REAL-KEY-123";

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("migrations/0003_planb.sql", here), "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}

// behaviour: "step0" | "step1" | "fail" ; header: whether to send cf-aig-step
function fakeAI(behaviour = "step0", header = true) {
  const calls = [];
  const gateway = () => ({
    run: async (steps, opts) => {
      calls.push({ steps, opts });
      if (behaviour === "fail") return new Response(JSON.stringify({ error: [{ message: "upstream secret-ish detail" }] }), { status: 502 });
      const body = behaviour === "step0"
        ? { result: { response: "1. Check deploy\n2. Roll back\n3. Watch errors" }, success: true }
        : { type: "message", model: MODELS.backup, content: [{ type: "text", text: "1. Roll back v4.18\n2. Compare\n3. Verify" }] };
      const h = { "content-type": "application/json", "cf-aig-log-id": "log-1" };
      if (header) h["cf-aig-step"] = behaviour === "step0" ? "0" : "1";
      return new Response(JSON.stringify(body), { headers: h });
    },
    getLog: async () => ({ duration: 900 }),
  });
  return { gateway, calls, aiGatewayLogId: null };
}

const post = (body, ip = "203.0.113.7", ctype = "application/json") => new Request("http://x/api/planb", {
  method: "POST", headers: { "content-type": ctype, "cf-connecting-ip": ip }, body: typeof body === "string" ? body : JSON.stringify(body),
});
const env = (o = {}) => ({ DB: fakeD1(), AI: fakeAI(), ANTHROPIC_API_KEY: FAKE_KEY, WORKERS_AI_TOKEN: "fake-cf-token", PLANB_ACCOUNT_ID: "acct", PLANB_SALT: "test-salt", ...o });
// planb.js calls the gateway REST endpoint with fetch; route that to the fake gateway for this env.
const call = async (e, req) => {
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith("https://gateway.ai.cloudflare.com/v1/acct/")) throw new Error("unexpected fetch " + url);
    return e.AI.gateway().run(JSON.parse(init.body), { gateway: { skipCache: init.headers["cf-aig-skip-cache"] === "true" } });
  };
  const res = await onRequest({ request: req, env: e }); const text = await res.text(); return { res, text, body: JSON.parse(text) };
};

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log(`ok - ${name}`); };

await test("validation accepts exactly {incident 1-3, mode}", () => {
  for (const i of [1, 2, 3]) for (const m of ["healthy", "down", "slow"]) assert.equal(validateBody(JSON.stringify({ incident: i, mode: m })).ok, true);
  for (const bad of ["", "nope", "[]", "null", '{"incident":1}', '{"incident":4,"mode":"down"}', '{"incident":"1","mode":"down"}',
    '{"incident":1.5,"mode":"down"}', '{"incident":1,"mode":"DOWN"}', '{"incident":1,"mode":"down","prompt":"hi"}', JSON.stringify({ incident: 1, mode: "x".repeat(600) })]) {
    assert.equal(validateBody(bad).ok, false, bad.slice(0, 40));
  }
});

await test("IP hash is hex SHA-256, salted, changes daily, never the raw IP", async () => {
  const a = await hashIp("203.0.113.7", "2026-10-10", "s");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await hashIp("203.0.113.7", "2026-10-10", "s"));
  assert.notEqual(a, await hashIp("203.0.113.7", "2026-10-11", "s"));
  assert.notEqual(a, await hashIp("203.0.113.7", "2026-10-10", "t"));
  assert.ok(!a.includes("203"));
});

await test("per-IP window: 10 allowed, 11th refused with retry, other IP fine, old rows pruned", async () => {
  const e = env(); const lim = limits(e); const t = Date.now();
  for (let i = 0; i < 10; i++) assert.equal((await takeIpSlot(e, "h1", t + i, lim)).ok, true);
  const no = await takeIpSlot(e, "h1", t + 10, lim);
  assert.equal(no.ok, false); assert.ok(no.retryAfterS > 0 && no.retryAfterS <= 600);
  assert.equal((await takeIpSlot(e, "h2", t + 10, lim)).ok, true);
  assert.equal((await takeIpSlot(e, "h1", t + 600_001, lim)).ok, true, "window slides");
  e.DB.raw.prepare("INSERT INTO planb_hits VALUES ('old', ?)").run(t - 2 * 86_400_000);
  await takeIpSlot(e, "h3", t, lim);
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) c FROM planb_hits WHERE ip_hash='old'").get().c, 0);
});

await test("daily cap is atomic-style: stops exactly at cap, per column", async () => {
  const e = env(); const d = "2026-10-10";
  assert.equal(await takeDaily(e, "runs", 2, d), true);
  assert.equal(await takeDaily(e, "runs", 2, d), true);
  assert.equal(await takeDaily(e, "runs", 2, d), false);
  assert.equal(await takeDaily(e, "rescues", 1, d), true);
  assert.equal(await takeDaily(e, "rescues", 1, d), false);
  assert.equal(await takeDaily(e, "runs", 2, "2026-10-11"), true, "new day resets");
  await assert.rejects(() => takeDaily(e, "runs; DROP TABLE x", 1, d));
});

await test("steps: down = invalid model, slow = 1 ms timeout, no retries, cache skipped", () => {
  const down = buildSteps({ ANTHROPIC_API_KEY: "k" }, 1, "down", true);
  assert.equal(down[0].endpoint, MODELS.broken);
  assert.equal(down[0].config.maxAttempts, 1);
  assert.equal(down[1].provider, "anthropic"); assert.equal(down[1].endpoint, "v1/messages"); assert.equal(down[1].query.model, "claude-haiku-5-5");
  const slow = buildSteps({}, 2, "slow", false);
  assert.equal(slow.length, 1); assert.equal(slow[0].endpoint, MODELS.primary);
  assert.equal(slow[0].config.requestTimeout, 1); assert.equal(slow[0].headers["cf-aig-request-timeout"], "1");
  assert.equal(slow[0].headers["cf-aig-skip-cache"], "true");
  assert.equal(slow[0].query.max_tokens, 200);
});

await test("identify: header wins; shape used when header missing", () => {
  assert.deepEqual(identify(new Headers({ "cf-aig-step": "1" }), { type: "message", content: [] }).step, 1);
  assert.equal(identify(new Headers(), { result: { response: "x" } }).stepSource, "response shape");
  assert.equal(identify(new Headers(), { type: "message", content: [] }).step, 1);
  assert.equal(identify(new Headers(), { weird: true }).step, null);
});

await test("healthy run: workers-ai answers, no-store, no key in response", async () => {
  const e = env();
  const { res, text, body } = await call(e, post({ incident: 1, mode: "healthy" }));
  assert.equal(res.status, 200); assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(body.answeredBy, "workers-ai"); assert.equal(body.step, 0); assert.equal(body.stepSource, "cf-aig-step header");
  assert.equal(body.attempts[0].outcome, "ok"); assert.equal(body.attempts[1].outcome, "not needed");
  assert.ok(!text.includes(FAKE_KEY)); assert.equal(body.debug, undefined);
  assert.equal(e.AI.calls[0].opts.gateway.skipCache, true);
  assert.equal(e.AI.calls[0].steps[1].headers["x-api-key"], FAKE_KEY, "key goes to the gateway step only");
});

await test("down run: anthropic answers via header, timings from log, rescue counted", async () => {
  const e = env({ AI: fakeAI("step1") });
  const { res, text, body } = await call(e, post({ incident: 2, mode: "down" }));
  assert.equal(res.status, 200);
  assert.equal(body.answeredBy, "anthropic"); assert.equal(body.model, "claude-haiku-5-5");
  assert.equal(body.attempts[0].outcome, "error"); assert.equal(body.attempts[1].ms, 900);
  assert.ok(!text.includes(FAKE_KEY));
  assert.equal(e.DB.raw.prepare("SELECT rescues FROM planb_budget").get().rescues, 1);
});

await test("slow run without cf-aig-step: shape detection", async () => {
  const e = env({ AI: fakeAI("step1", false) });
  const { body } = await call(e, post({ incident: 3, mode: "slow" }));
  assert.equal(body.answeredBy, "anthropic"); assert.equal(body.stepSource, "response shape"); assert.equal(body.attempts[0].outcome, "timeout");
});

await test("all steps fail: 503, upstream body not forwarded", async () => {
  const e = env({ AI: fakeAI("fail") });
  const { res, text, body } = await call(e, post({ incident: 1, mode: "down" }));
  assert.equal(res.status, 503); assert.equal(body.error.code, "all_steps_failed");
  assert.ok(!text.includes("secret-ish")); assert.equal(body.attempts.length, 2);
});

await test("405, 400 (content type, body), 429 with Retry-After", async () => {
  const e = env({ PLANB_IP_LIMIT: "2" });
  let r = await call(e, new Request("http://x/api/planb"));
  assert.equal(r.res.status, 405); assert.equal(r.res.headers.get("allow"), "POST");
  assert.equal((await call(e, post({ incident: 1, mode: "healthy" }, "1.1.1.1", "text/plain"))).res.status, 400);
  assert.equal((await call(e, post('{"incident":9,"mode":"healthy"}'))).res.status, 400);
  assert.equal((await call(e, post({ incident: 1, mode: "healthy" }, "9.9.9.9"))).res.status, 200);
  assert.equal((await call(e, post({ incident: 1, mode: "healthy" }, "9.9.9.9"))).res.status, 200);
  r = await call(e, post({ incident: 1, mode: "healthy" }, "9.9.9.9"));
  assert.equal(r.res.status, 429); assert.ok(Number(r.res.headers.get("retry-after")) > 0);
  assert.equal(r.res.headers.get("cache-control"), "no-store");
});

await test("daily run cap and rescue cap give the friendly 'resting' 503", async () => {
  const e = env({ PLANB_DAILY_RUNS: "2", PLANB_DAILY_RESCUES: "1", AI: fakeAI("step1") });
  assert.equal((await call(e, post({ incident: 1, mode: "down" }, "1.0.0.1"))).res.status, 200);
  let r = await call(e, post({ incident: 1, mode: "slow" }, "1.0.0.2"));
  assert.equal(r.res.status, 503); assert.equal(r.body.error.code, "daily_cap"); assert.match(r.body.error.message, /resting/);
  assert.equal(e.DB.raw.prepare("SELECT runs FROM planb_budget").get().runs, 1, "run given back when the rescue cap refused");
  // healthy still runs, without a backup, and says so
  e.AI = fakeAI("step0");
  r = await call(e, post({ incident: 1, mode: "healthy" }, "1.0.0.3"));
  assert.equal(r.res.status, 200); assert.match(r.body.capNote, /no Plan B/); assert.equal(e.AI.calls[0].steps.length, 1);
  r = await call(e, post({ incident: 1, mode: "healthy" }, "1.0.0.4"));
  assert.equal(r.res.status, 503); assert.equal(r.body.error.code, "daily_cap");
});

await test("missing key: broken modes refuse politely, healthy runs primary only", async () => {
  const e = env({ ANTHROPIC_API_KEY: undefined });
  assert.equal((await call(e, post({ incident: 1, mode: "down" }))).res.status, 503);
  const r = await call(e, post({ incident: 1, mode: "healthy" }));
  assert.equal(r.res.status, 200); assert.match(r.body.capNote, /isn't configured/);
});

await test("debug block only with PLANB_DEBUG=1 and only cf-aig-* headers", async () => {
  const { body } = await call(env({ PLANB_DEBUG: "1" }), post({ incident: 1, mode: "healthy" }));
  assert.deepEqual(Object.keys(body.debug.headers).sort(), ["cf-aig-log-id", "cf-aig-step", "content-type"]);
});

console.log(`\n${n} tests passed (utc day ${utcDay()})`);
