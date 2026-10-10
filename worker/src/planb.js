// Plan B: an AI failover demo. One fixed, fictional incident goes to AI Gateway as a two-step
// Universal Endpoint request: Workers AI first, Anthropic as the fallback. The visitor can break
// the primary on purpose ("down" = invalid model id, "slow" = 1 ms timeout) and see which step
// answered and how long each attempt took. Shared by the Pages Function at /api/planb.
//
// API shapes (checked 2026-10-10):
// - env.AI.gateway(id).run(data | data[], { gateway?: { skipCache, ... } }) -> Promise<Response>:
//   @cloudflare/workers-types 4.20260228.0 (AiGateway.run accepts AIGatewayUniversalRequest[]).
//   Cloudflare's docs only show the single-object form for the binding; the array form is the
//   documented Universal Endpoint body: https://developers.cloudflare.com/ai-gateway/usage/universal/
//   (the Universal Endpoint is marked deprecated but "will continue to work for existing integrations").
// - Each step: { provider, endpoint, headers, query } plus optional { config: { requestTimeout,
//   maxAttempts } } (ms; documented on the Universal page). The workers-types step type has no
//   `config`, so we ALSO send the documented per-request headers cf-aig-request-timeout and
//   cf-aig-max-attempts (https://developers.cloudflare.com/ai-gateway/configuration/request-handling/).
//   UNVERIFIED: which of the two the binding honours; the spike (worker/spike-planb.mjs) checks it.
// - cf-aig-step response header = index of the step that answered:
//   https://developers.cloudflare.com/ai-gateway/configuration/fallbacks/
//   UNVERIFIED: whether the binding's Response carries it. If not, we read the response shape.
// - Errors and request timeouts both trigger fallback (fallbacks + universal pages).
// - cf-aig-skip-cache: true (https://developers.cloudflare.com/ai-gateway/configuration/caching/);
//   caching is off by default anyway. We set it per step and via options.gateway.skipCache.
// - workers-ai step endpoint is the model id, e.g. "@cf/meta/llama-3.1-8b-instruct" in the docs.
//   Docs examples add "Authorization: Bearer {cloudflare_token}" to workers-ai steps; UNVERIFIED
//   whether the binding needs it. If WORKERS_AI_TOKEN is set (a Pages secret), we send it.
// - anthropic step: endpoint "v1/messages", headers x-api-key + anthropic-version: 2023-06-01
//   (https://developers.cloudflare.com/ai-gateway/usage/providers/anthropic/).

export const MODELS = {
  primary: "@cf/meta/llama-3.2-3b-instruct",
  broken: "@cf/planb/broken-on-purpose",   // "down" mode: a model id that does not exist
  backup: "claude-haiku-5-5",
};

export const INCIDENTS = {
  1: { title: "Checkout 5xx after a deploy", text: "Fictional company Parrot Pantry. 12 minutes ago version 4.18 of the checkout service rolled out to all regions. Since then 9% of POST /checkout requests return HTTP 502 or 503, up from 0.1%. p99 latency rose from 400 ms to 2.8 s. Payment provider status page is green. No database alerts." },
  2: { title: "DNS failures in one region", text: "Fictional company Parrot Pantry. In eu-west only, about 30% of service-to-service calls fail with 'SERVFAIL' or 'no such host' for internal names. Other regions are fine. The failures started 20 minutes ago, around when a node pool autoscaled from 40 to 95 nodes. CoreDNS pods show high CPU." },
  3: { title: "A growing queue backlog", text: "Fictional company Parrot Pantry. The order-events queue backlog grew from near zero to 1.2 million messages over 45 minutes and is still rising. Producers are at normal rates. Consumer count is unchanged, but consumer error logs show retries on a downstream inventory API that now responds in 3 s instead of 150 ms." },
};

const SYSTEM = "You are an experienced on-call SRE. The incident is fictional. Reply in plain text with exactly three numbered triage steps, under 80 words in total. No preamble.";
const MAX_TOKENS = 200;
const MODES = new Set(["healthy", "down", "slow"]);
const STEP_TIMEOUT_MS = 12_000;   // per step, for real (non-forced) slowness
const OVERALL_TIMEOUT_MS = 28_000;
const MAX_BODY_BYTES = 512;

const DEFAULTS = { runs: 300, rescues: 100, ipLimit: 10, ipWindowMin: 10 };
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
export function limits(env) {
  return {
    runs: num(env.PLANB_DAILY_RUNS, DEFAULTS.runs),
    rescues: num(env.PLANB_DAILY_RESCUES, DEFAULTS.rescues),
    ipLimit: num(env.PLANB_IP_LIMIT, DEFAULTS.ipLimit),
    ipWindowMs: num(env.PLANB_IP_WINDOW_MIN, DEFAULTS.ipWindowMin) * 60_000,
  };
}

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
const fail = (status, code, message, extra = {}) => json({ error: { code, message }, ...extra }, status);
const RESTING = "Plan B is resting until tomorrow (the daily cap is reached). Try again after midnight UTC.";

// ---------- validation ----------

// Returns { ok: true, incident, mode } or { ok: false, message }. Only the two known keys are allowed.
export function validateBody(raw) {
  if (typeof raw !== "string" || raw.length === 0) return { ok: false, message: "Send a JSON body like {\"incident\":1,\"mode\":\"healthy\"}." };
  if (raw.length > MAX_BODY_BYTES) return { ok: false, message: "Request body is too large." };
  let body;
  try { body = JSON.parse(raw); } catch { return { ok: false, message: "Body is not valid JSON." }; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "Body must be a JSON object." };
  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("incident") || !keys.includes("mode")) return { ok: false, message: "Body must have exactly two fields: incident and mode." };
  const { incident, mode } = body;
  if (!Number.isInteger(incident) || !INCIDENTS[incident]) return { ok: false, message: "incident must be 1, 2 or 3." };
  if (typeof mode !== "string" || !MODES.has(mode)) return { ok: false, message: "mode must be \"healthy\", \"down\" or \"slow\"." };
  return { ok: true, incident, mode };
}

// ---------- guardrails (D1) ----------

export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

// SHA-256 of salt | UTC day | IP, hex. The day in the input means hashes can't be linked across days.
// Set the PLANB_SALT secret in production; without it an IPv4 hash could be brute-forced.
export async function hashIp(ip, day, salt) {
  const data = new TextEncoder().encode(`${salt || "planb-v1"}|${day}|${ip || "unknown"}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Per-visitor sliding window. One INSERT ... SELECT ... WHERE count < limit statement, so two
// concurrent requests from the same visitor can't both slip under the limit.
export async function takeIpSlot(env, ipHash, now, lim) {
  await env.DB.prepare("DELETE FROM planb_hits WHERE ts < ?").bind(now - 86_400_000).run();
  const row = await env.DB.prepare(
    "INSERT INTO planb_hits (ip_hash, ts) SELECT ?, ? WHERE (SELECT COUNT(*) FROM planb_hits WHERE ip_hash = ? AND ts > ?) < ? RETURNING ts"
  ).bind(ipHash, now, ipHash, now - lim.ipWindowMs, lim.ipLimit).first();
  if (row) return { ok: true };
  const oldest = await env.DB.prepare("SELECT MIN(ts) AS t FROM planb_hits WHERE ip_hash = ? AND ts > ?").bind(ipHash, now - lim.ipWindowMs).first();
  const retryAfterS = oldest?.t ? Math.max(1, Math.ceil((oldest.t + lim.ipWindowMs - now) / 1000)) : Math.ceil(lim.ipWindowMs / 1000);
  return { ok: false, retryAfterS };
}

// Same atomic pattern as takeJevBudget in worker/src/index.js: make sure today's row exists,
// then increment only while under the cap. RETURNING tells us whether the increment happened.
export async function takeDaily(env, column, cap, day) {
  if (column !== "runs" && column !== "rescues") throw new Error("bad column");
  await env.DB.prepare("INSERT INTO planb_budget (day, runs, rescues) VALUES (?, 0, 0) ON CONFLICT(day) DO NOTHING").bind(day).run();
  const res = await env.DB.prepare(`UPDATE planb_budget SET ${column} = ${column} + 1 WHERE day = ? AND ${column} < ? RETURNING ${column}`).bind(day, cap).first();
  return Boolean(res);
}
export async function giveBackRun(env, day) {
  await env.DB.prepare("UPDATE planb_budget SET runs = runs - 1 WHERE day = ? AND runs > 0").bind(day).run();
}
async function rescuesLeft(env, cap, day) {
  const row = await env.DB.prepare("SELECT rescues FROM planb_budget WHERE day = ?").bind(day).first();
  return (row?.rescues ?? 0) < cap;
}
async function recordRescue(env, day) {
  await env.DB.prepare("UPDATE planb_budget SET rescues = rescues + 1 WHERE day = ?").bind(day).run();
}

// ---------- the gateway request ----------

export function buildSteps(env, incident, mode, withBackup) {
  const userText = `Incident: ${INCIDENTS[incident].text}\nGive the first three triage steps in under 80 words.`;
  const primaryTimeout = mode === "slow" ? 1 : STEP_TIMEOUT_MS;
  const primaryHeaders = {
    "Content-Type": "application/json",
    "cf-aig-skip-cache": "true",
    "cf-aig-request-timeout": String(primaryTimeout),
    "cf-aig-max-attempts": "1",
  };
  if (env.WORKERS_AI_TOKEN) primaryHeaders.Authorization = `Bearer ${env.WORKERS_AI_TOKEN}`;
  const steps = [{
    provider: "workers-ai",
    endpoint: mode === "down" ? MODELS.broken : MODELS.primary,
    headers: primaryHeaders,
    query: { messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userText }], max_tokens: MAX_TOKENS },
    config: { requestTimeout: primaryTimeout, maxAttempts: 1 },
  }];
  if (withBackup) {
    steps.push({
      provider: "anthropic",
      endpoint: "v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "cf-aig-skip-cache": "true",
        "cf-aig-request-timeout": String(STEP_TIMEOUT_MS),
        "cf-aig-max-attempts": "1",
      },
      // Claude Haiku 5.5 thinks by default; "disabled" is accepted at its default (medium) effort
      // and keeps the 200-token budget for the answer.
      query: { model: MODELS.backup, max_tokens: MAX_TOKENS, system: SYSTEM, thinking: { type: "disabled" }, messages: [{ role: "user", content: userText }] },
      config: { requestTimeout: STEP_TIMEOUT_MS, maxAttempts: 1 },
    });
  }
  return steps;
}

// Which step answered: the cf-aig-step header when present, otherwise the body shape
// (Anthropic Messages: type "message" + content[]; Workers AI: result.response / response / choices).
export function identify(headers, body) {
  const raw = headers.get("cf-aig-step");
  const shape = body && typeof body === "object"
    ? (body.type === "message" && Array.isArray(body.content) ? 1
      : (typeof body.result?.response === "string" || typeof body.response === "string" || Array.isArray(body.choices)) ? 0 : null)
    : null;
  if (raw != null && /^\d+$/.test(raw.trim())) return { step: Number(raw), stepSource: "cf-aig-step header", shapeAgrees: shape == null ? null : shape === Number(raw) };
  return { step: shape, stepSource: "response shape", shapeAgrees: null };
}

export function extractText(step, body) {
  let t = "";
  if (step === 1) t = (body?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("\n");
  else t = body?.result?.response ?? body?.response ?? body?.choices?.[0]?.message?.content ?? "";
  t = String(t).trim();
  return t.length > 1500 ? `${t.slice(0, 1500)}…` : t;
}

const failNote = { down: { outcome: "error", note: "invalid model id, broken on purpose" }, slow: { outcome: "timeout", note: "1 ms timeout, broken on purpose" }, healthy: { outcome: "failed", note: "a real failure (not forced)" } };

function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); })]).finally(() => clearTimeout(t));
}

// Best effort: the answering step's own duration from the gateway log, so the failed attempt's
// time can be derived as total minus that. UNVERIFIED that the log is readable this soon.
async function answeredDuration(env, gatewayId, res) {
  try {
    const logId = res.headers.get("cf-aig-log-id") || env.AI.aiGatewayLogId;
    if (!logId) return null;
    const log = await withTimeout(env.AI.gateway(gatewayId).getLog(logId), 1500);
    return Number.isFinite(log?.duration) ? Math.round(log.duration) : null;
  } catch { return null; }
}

// ---------- handler ----------

export async function planbApi(request, env) {
  if (request.method !== "POST") {
    const r = fail(405, "method_not_allowed", "Use POST with a JSON body.");
    r.headers.set("Allow", "POST");
    return r;
  }
  if (!env.DB || !env.AI || !env.PLANB_ACCOUNT_ID || !env.WORKERS_AI_TOKEN) return fail(503, "not_configured", "Plan B isn't set up on this deployment yet.");
  const ctype = request.headers.get("content-type") || "";
  if (!ctype.toLowerCase().includes("application/json")) return fail(400, "bad_request", "Send Content-Type: application/json.");
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return fail(400, "bad_request", "Request body is too large.");
  const v = validateBody(await request.text());
  if (!v.ok) return fail(400, "bad_request", v.message);

  const lim = limits(env);
  const now = Date.now();
  const day = utcDay(now);
  const ipHash = await hashIp(request.headers.get("cf-connecting-ip"), day, env.PLANB_SALT);
  const slot = await takeIpSlot(env, ipHash, now, lim);
  if (!slot.ok) {
    const r = fail(429, "rate_limited", `That's ${lim.ipLimit} runs in ${lim.ipWindowMs / 60_000} minutes. Try again in about ${Math.ceil(slot.retryAfterS / 60)} min.`);
    r.headers.set("Retry-After", String(slot.retryAfterS));
    return r;
  }
  if (!(await takeDaily(env, "runs", lim.runs, day))) return fail(503, "daily_cap", RESTING);

  // The backup is billed per call, so it has its own cap. Broken modes need it, so reserve it up
  // front; a healthy run includes it only while today's rescues are under the cap and counts it if used.
  const hasKey = Boolean(env.ANTHROPIC_API_KEY);
  let withBackup = false;
  let capNote;
  if (v.mode !== "healthy") {
    if (!hasKey) { await giveBackRun(env, day); return fail(503, "not_configured", "The backup model isn't set up on this deployment yet."); }
    if (!(await takeDaily(env, "rescues", lim.rescues, day))) { await giveBackRun(env, day); return fail(503, "daily_cap", RESTING); }
    withBackup = true;
  } else if (hasKey && (await rescuesLeft(env, lim.rescues, day))) {
    withBackup = true;
  } else {
    capNote = hasKey ? "Today's backup allowance is used up, so this run had no Plan B." : "The backup model isn't configured, so this run had no Plan B.";
  }

  const gatewayId = env.PLANB_GATEWAY || "sre-lab";
  const steps = buildSteps(env, v.incident, v.mode, withBackup);
  const providerOf = (i) => (i === 0 ? { provider: "workers-ai", model: steps[0].endpoint } : { provider: "anthropic", model: MODELS.backup });

  const t0 = Date.now();
  let res, body;
  try {
    // Direct call to the gateway's Universal Endpoint (REST). The env.AI.gateway().run() binding
    // returned 401 for the workers-ai step in testing; the REST endpoint works and sets cf-aig-step.
    const url = `https://gateway.ai.cloudflare.com/v1/${env.PLANB_ACCOUNT_ID}/${gatewayId}`;
    res = await withTimeout(fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "cf-aig-skip-cache": "true" },
      body: JSON.stringify(steps),
    }), OVERALL_TIMEOUT_MS);
    body = await res.clone().json().catch(() => null);
  } catch (e) {
    console.log("planb: gateway call threw", String(e?.message || e).slice(0, 120));
    return fail(503, "upstream_unavailable", "The AI Gateway didn't answer in time. Nothing was cached; try again in a minute.", { totalMs: Date.now() - t0 });
  }
  const totalMs = Date.now() - t0;
  const who = identify(res.headers, body);

  if (!res.ok || who.step == null) {
    // Every step failed (or the answer is unreadable). Never forward the upstream body.
    console.log("planb: no usable answer", res.status, res.headers.get("cf-aig-step"));
    const attempts = steps.map((s, i) => ({ step: i, ...providerOf(i), outcome: i === 0 && v.mode !== "healthy" ? failNote[v.mode].outcome : "failed", note: i === 0 ? failNote[v.mode].note : undefined, ms: null }));
    return fail(503, "all_steps_failed", withBackup ? "Both the primary and the backup failed. That's the case Plan B can't fix." : "The primary failed and there was no backup for this run.", { attempts, totalMs, capNote, ...(env.PLANB_DEBUG === "1" ? { debug: gatewayDebug(res, who) } : {}) });
  }

  const step = who.step;
  const attempts = [];
  if (step === 0) {
    attempts.push({ step: 0, ...providerOf(0), outcome: "ok", ms: totalMs, timing: "measured" });
    if (withBackup) attempts.push({ step: 1, ...providerOf(1), outcome: "not needed", ms: null });
  } else {
    if (v.mode === "healthy") { /* reserved only for broken modes; count a healthy-mode rescue now */ await recordRescue(env, day); }
    const d = await answeredDuration(env, gatewayId, res);
    attempts.push({ step: 0, ...providerOf(0), ...failNote[v.mode], ms: d == null ? null : Math.max(0, totalMs - d), timing: d == null ? "unknown" : "derived (total minus backup)" });
    attempts.push({ step: 1, ...providerOf(1), outcome: "ok", ms: d, timing: d == null ? "unknown" : "gateway log" });
  }

  const text = extractText(step, body);
  return json({
    incident: { id: v.incident, title: INCIDENTS[v.incident].title },
    mode: v.mode,
    answeredBy: step === 0 ? "workers-ai" : "anthropic",
    model: providerOf(step).model,
    step,
    stepSource: who.stepSource,
    attempts,
    totalMs,
    text: text || "(the model returned an empty answer)",
    ...(capNote ? { capNote } : {}),
    // Dev only (PLANB_DEBUG=1 in .dev.vars): what the gateway actually returned, for the spike.
    // Header names and values only; nothing from the request, no keys, no upstream body.
    ...(env.PLANB_DEBUG === "1" ? { debug: gatewayDebug(res, who) } : {}),
  });
}

function gatewayDebug(res, who) {
  const keep = {};
  for (const [k, val] of res.headers) if (k.startsWith("cf-aig-") || k === "content-type") keep[k] = val.slice(0, 80);
  return { gatewayStatus: res.status, headers: keep, shapeAgreesWithHeader: who.shapeAgrees };
}
