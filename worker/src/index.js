// Down or Me: scheduled uptime checks, Jev triage for anything unusual, and a small JSON API
// for the status board. Jev is called only from here, never from the browser.
import { allTargets } from "./targets.js";

const CHECK_TIMEOUT_MS = 10_000;
const SLOW_FACTOR = 3;          // latency this many times the recent median counts as unusual
const SLOW_FLOOR_MS = 1500;     // ...but only above this absolute floor
const JEV_RECHECK_MIN = 30;     // while a problem continues, ask Jev again at most this often
const NOTIFY_MIN_CONFIDENCE = 0.8;

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runCycle(env));
  },

  // No public HTTP surface: the board's API is served by Pages Functions.
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};

// ---------- the check cycle ----------

async function runCycle(env) {
  const TARGETS = allTargets(env);
  const now = Date.now();
  const results = await Promise.all(TARGETS.map((t) => checkTarget(t, env).catch((e) => ({ ok: false, status: "error", error: String(e).slice(0, 200) }))));
  const failingNow = results.filter((r) => r && !r.skipped && !r.ok).length;

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    const r = results[i];
    if (!r || r.skipped) continue;
    await env.DB.prepare("INSERT INTO checks (ts, target, ok, status, latency_ms, detail) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(now, t.id, r.ok ? 1 : 0, String(r.status), r.latencyMs ?? null, r.detail ?? r.error ?? null).run();

    const unusual = !r.ok || (await isSlow(env, t.id, r.latencyMs));
    const state = await env.DB.prepare("SELECT * FROM state WHERE target = ?").bind(t.id).first();
    const newStatus = !r.ok ? "down" : unusual ? "slow" : "up";

    if (newStatus === "up") {
      await env.DB.prepare("INSERT INTO state (target, status, since, last_jev_ts, notified) VALUES (?, 'up', ?, NULL, 0) ON CONFLICT(target) DO UPDATE SET status='up', since=CASE WHEN state.status='up' THEN state.since ELSE excluded.since END, notified=0")
        .bind(t.id, now).run();
      continue;
    }

    const changed = !state || state.status === "up";
    const stale = state && state.last_jev_ts && now - state.last_jev_ts > JEV_RECHECK_MIN * 60_000;
    const since = changed ? now : state.since;
    await env.DB.prepare("INSERT INTO state (target, status, since, last_jev_ts, notified) VALUES (?, ?, ?, NULL, 0) ON CONFLICT(target) DO UPDATE SET status=excluded.status, since=?")
      .bind(t.id, newStatus, since, since).run();

    if (!(changed || stale)) continue;
    if (!(await takeJevBudget(env))) continue; // daily cap reached: show on board, no AI call

    const history = await recentHistory(env, t.id);
    const verdict = await askJev(env, { target: t, result: r, history, failingNow, totalTargets: TARGETS.length, problemSince: new Date(since).toISOString() });
    if (!verdict) continue;

    await env.DB.prepare("INSERT INTO verdicts (ts, target, cause, confidence, notify_prob, model) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(now, t.id, verdict.cause, verdict.confidence, verdict.notifyProb, verdict.model).run();
    await env.DB.prepare("UPDATE state SET last_jev_ts = ? WHERE target = ?").bind(now, t.id).run();

    const shouldNotify = verdict.notifyProb >= NOTIFY_MIN_CONFIDENCE && verdict.confidence >= NOTIFY_MIN_CONFIDENCE
      && (verdict.cause === "real_outage" || verdict.cause === "degraded") && !(state && state.notified);
    if (shouldNotify && (await notify(env, t, r, verdict))) {
      await env.DB.prepare("UPDATE state SET notified = 1 WHERE target = ?").bind(t.id).run();
    }
  }

  // keep 30 days of history
  await env.DB.prepare("DELETE FROM checks WHERE ts < ?").bind(now - 30 * 86_400_000).run();
}

async function checkTarget(t, env) {
  if (t.kind === "http") return httpCheck(t);
  if (t.kind === "statuspage") return statuspageCheck(t);
  if (t.kind === "wow-realm") return wowRealmCheck(t, env);
  return { skipped: true };
}

async function timedFetch(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": "down-or-me (lab.sallyroth.dev)", ...(init.headers || {}) } });
    return { res, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

async function httpCheck(t) {
  try {
    const { res, latencyMs } = await timedFetch(t.url, { redirect: "follow" });
    const expected = t.expectStatus || null;
    const ok = expected ? expected.includes(res.status) : res.status < 400;
    return { ok, status: res.status, latencyMs };
  } catch (e) {
    return { ok: false, status: e.name === "AbortError" ? "timeout" : "network-error", error: String(e).slice(0, 200) };
  }
}

async function statuspageCheck(t) {
  try {
    const { res, latencyMs } = await timedFetch(t.url);
    const data = await res.json();
    const indicator = data?.status?.indicator ?? "unknown"; // none | minor | major | critical
    const incidents = (data?.incidents || []).slice(0, 3).map((i) => `${i.name} (${i.status})`).join("; ");
    return { ok: indicator === "none", status: indicator, latencyMs, detail: incidents || data?.status?.description || null };
  } catch (e) {
    return { ok: false, status: "unreachable", error: String(e).slice(0, 200) };
  }
}

// Blizzard Game Data API: realm -> connected realm -> status. Skipped without credentials.
async function wowRealmCheck(t, env) {
  if (!env.BLIZZARD_CLIENT_ID || !env.BLIZZARD_CLIENT_SECRET) return { skipped: true };
  const tokenRes = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${env.BLIZZARD_CLIENT_ID}:${env.BLIZZARD_CLIENT_SECRET}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) return { ok: false, status: `auth-${tokenRes.status}` };
  const { access_token } = await tokenRes.json();
  const auth = { headers: { Authorization: `Bearer ${access_token}` } };
  // Classic has several namespaces (era, progression, anniversary); try each until the realm resolves.
  for (const ns of ["dynamic-classicann", "dynamic-classic1x", "dynamic-classic"]) {
    const { res, latencyMs } = await timedFetch(`https://${t.region}.api.blizzard.com/data/wow/realm/${t.realm}?namespace=${ns}-${t.region}&locale=en_GB`, auth);
    if (!res.ok) continue;
    const realm = await res.json();
    const href = realm?.connected_realm?.href;
    if (!href) continue;
    const cr = await (await timedFetch(href, auth)).res.json();
    const type = cr?.status?.type ?? "UNKNOWN"; // UP | DOWN
    return { ok: type === "UP", status: type, latencyMs, detail: `namespace ${ns}` };
  }
  return { ok: false, status: "realm-not-found" };
}

async function isSlow(env, target, latencyMs) {
  if (latencyMs == null || latencyMs < SLOW_FLOOR_MS) return false;
  const rows = await env.DB.prepare("SELECT latency_ms FROM checks WHERE target = ? AND ok = 1 AND latency_ms IS NOT NULL ORDER BY ts DESC LIMIT 24").bind(target).all();
  const xs = rows.results.map((r) => r.latency_ms).sort((a, b) => a - b);
  if (xs.length < 6) return false;
  const median = xs[Math.floor(xs.length / 2)];
  return latencyMs > median * SLOW_FACTOR;
}

async function recentHistory(env, target) {
  const rows = await env.DB.prepare("SELECT ts, ok, status, latency_ms FROM checks WHERE target = ? ORDER BY ts DESC LIMIT 12").bind(target).all();
  return rows.results.map((r) => `${new Date(r.ts).toISOString().slice(11, 16)}Z ${r.ok ? "ok" : "FAIL"} ${r.status} ${r.latency_ms ?? "-"}ms`);
}

// ---------- Jev ----------

async function takeJevBudget(env) {
  const cap = Number(env.JEV_DAILY_CAP || 200);
  const day = new Date().toISOString().slice(0, 10);
  await env.DB.prepare("INSERT INTO budget (day, jev_calls) VALUES (?, 0) ON CONFLICT(day) DO NOTHING").bind(day).run();
  const res = await env.DB.prepare("UPDATE budget SET jev_calls = jev_calls + 1 WHERE day = ? AND jev_calls < ? RETURNING jev_calls").bind(day, cap).first();
  return Boolean(res);
}

async function askJev(env, ctx) {
  if (!env.JEV_API_KEY) return null;
  const body = {
    model: env.JEV_MODEL || "jev-latest",
    state: {
      service: ctx.target.name,
      check_type: ctx.target.kind,
      latest_result: { ok: ctx.result.ok, status: String(ctx.result.status), latency_ms: ctx.result.latencyMs ?? null, detail: ctx.result.detail ?? ctx.result.error ?? null },
      recent_checks_newest_first: ctx.history,
      problem_since_utc: ctx.problemSince,
      other_services_failing_right_now: `${Math.max(0, ctx.failingNow - 1)} of ${ctx.totalTargets - 1}`,
      checked_from: "Cloudflare Workers (not the owner's home network)",
      now_utc: new Date().toISOString(),
    },
    questions: {
      cause: {
        type: "choice",
        instructions: "What is the most likely explanation for this monitoring result?",
        criteria: {
          real_outage: "The service itself is down or failing for users.",
          degraded: "The service is up but slow, partially failing, or reporting a minor incident.",
          checker_side: "The problem is likely on the monitoring side: many unrelated services failing at once, or a DNS or network error from the checker.",
          planned_maintenance: "Scheduled maintenance, such as a game realm's weekly maintenance window or a status page reporting maintenance.",
          transient_blip: "A brief one-off failure that is likely noise and will clear on its own.",
        },
      },
      notify: {
        type: "noul",
        instructions: "Should the owner get an email about this right now? Yes only for a real, ongoing problem with this service that isn't planned maintenance, a checker-side issue, or a brief blip.",
      },
    },
  };
  try {
    const res = await fetch(`${env.JEV_BASE_URL || "https://api.typesafe.ai"}/v1/systemone`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.JEV_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("Jev error", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = await res.json();
    return {
      cause: data.answers?.cause?.choice ?? "unknown",
      confidence: data.answers?.cause?.confidence ?? 0,
      notifyProb: data.answers?.notify?.noul ?? 0,
      model: data.model ?? null,
    };
  } catch (e) {
    console.error("Jev call failed", String(e));
    return null;
  }
}

// ---------- notification ----------

async function notify(env, t, r, v) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM || !env.NOTIFY_TO) return false;
  const cause = v.cause.replace("_", " ");
  const text = [
    `${t.name} looks like: ${cause} (confidence ${(v.confidence * 100).toFixed(0)}%).`,
    `Latest check: ${r.status}${r.latencyMs ? `, ${r.latencyMs} ms` : ""}.`,
    r.detail ? `Detail: ${r.detail}` : "",
    "",
    "Board: https://lab.sallyroth.dev/status/",
  ].filter(Boolean).join("\n");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Down or Me <${env.NOTIFY_FROM}>`, to: [env.NOTIFY_TO], subject: `[Down or Me] ${t.name}: ${cause}`, text }),
    });
    if (!res.ok) console.error("notify failed", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error("notify failed", String(e));
    return false;
  }
}
