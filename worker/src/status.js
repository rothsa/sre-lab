import { logger } from "./telemetry.js";

// Status API, shared by the Pages Functions at /api/status and /private/api/status.

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

let jwksCache = { team: null, keys: null, at: 0 };
async function accessKeys(team, fetchFn) {
  if (jwksCache.team === team && Date.now() - jwksCache.at < 3_600_000) return jwksCache.keys;
  const res = await fetchFn(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs: ${res.status}`);
  const { keys } = await res.json();
  jwksCache = { team, keys, at: Date.now() };
  return keys;
}

// Verifies the Cloudflare Access JWT (signature, issuer, audience, expiry) and that it belongs to
// the owner. Fails closed: without ACCESS_TEAM_DOMAIN, ACCESS_AUD and OWNER_EMAIL nothing passes.
// The cf-access-authenticated-user-email header alone is never trusted: anyone can send it.
export async function verifyAccess(req, env, fetchFn = fetch) {
  const team = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD, owner = env.OWNER_EMAIL;
  if (!team || !aud || !owner) return null;
  const token = req.headers.get("cf-access-jwt-assertion");
  const parts = token ? token.split(".") : [];
  if (parts.length !== 3) return null;
  try {
    const [h, p, s] = parts;
    const header = b64urlJson(h), claims = b64urlJson(p);
    if (header.alg !== "RS256" || !header.kid) return null;
    if (claims.iss !== `https://${team}`) return null;
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!auds.includes(aud)) return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== "number" || claims.exp < now) return null;
    if (typeof claims.nbf === "number" && claims.nbf > now + 60) return null;
    const jwk = (await accessKeys(team, fetchFn)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const email = String(claims.email || "").toLowerCase();
    return email && email === owner.toLowerCase() ? email : null;
  } catch (err) {
    logger.warn("access_jwt_verify_failed", { error: String(err) });
    return null;
  }
}

export async function statusApi(req, env, wantPrivate) {
  if (wantPrivate && !(await verifyAccess(req, env))) {
    return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  const { results: targets } = await env.DB.prepare(
    "SELECT id, name, kind, public FROM targets WHERE seen > ? AND (? OR public = 1) ORDER BY public DESC, position"
  ).bind(Date.now() - 3_600_000, wantPrivate ? 1 : 0).all();
  const dayAgo = Date.now() - 86_400_000;
  const out = [];
  for (const t of targets) {
    const state = await env.DB.prepare("SELECT status, since FROM state WHERE target = ?").bind(t.id).first();
    const up = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(ok) AS good, AVG(CASE WHEN ok=1 THEN latency_ms END) AS avg_ms FROM checks WHERE target = ? AND ts > ?").bind(t.id, dayAgo).first();
    const last = await env.DB.prepare("SELECT ts, ok, status, latency_ms FROM checks WHERE target = ? ORDER BY ts DESC LIMIT 1").bind(t.id).first();
    const verdict = await env.DB.prepare("SELECT ts, cause, confidence, notify_prob FROM verdicts WHERE target = ? ORDER BY ts DESC LIMIT 1").bind(t.id).first();
    const spark = await env.DB.prepare("SELECT ok FROM checks WHERE target = ? ORDER BY ts DESC LIMIT 48").bind(t.id).all();
    out.push({
      id: t.id,
      name: t.name,
      status: state?.status ?? (t.kind === "wow-realm" ? "not-configured" : "unknown"),
      since: state?.since ?? null,
      uptime24h: up?.n ? up.good / up.n : null,
      avgLatencyMs: up?.avg_ms ? Math.round(up.avg_ms) : null,
      last,
      verdict: verdict && state?.status !== "up" ? verdict : null,
      recent: spark.results.map((r) => r.ok).reverse(),
    });
  }
  const { results: latRows } = await env.DB.prepare(
    "SELECT latency_ms FROM checks WHERE ts > ? AND ok = 1 AND latency_ms IS NOT NULL ORDER BY latency_ms"
  ).bind(dayAgo).all();
  const lats = (latRows || []).map((r) => r.latency_ms);
  const pctAt = (arr, q) => (arr.length ? Math.round(arr[Math.min(arr.length - 1, Math.floor(arr.length * q))]) : null);
  const summary24 = await env.DB.prepare(
    "SELECT COUNT(*) AS n, SUM(ok) AS good, MAX(ts) AS last_ts FROM checks WHERE ts > ?"
  ).bind(dayAgo).first();
  const vCount = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM verdicts WHERE ts > ?"
  ).bind(Date.now() - 30 * 86_400_000).first();
  const telemetry = {
    checks24h: summary24?.n ?? 0,
    okRate24h: summary24?.n ? summary24.good / summary24.n : null,
    p50LatencyMs: pctAt(lats, 0.5),
    p95LatencyMs: pctAt(lats, 0.95),
    verdicts30d: vCount?.n ?? 0,
    lastCycleAgeSec: summary24?.last_ts ? Math.max(0, Math.round((Date.now() - summary24.last_ts) / 1000)) : null,
  };
  const cache = wantPrivate ? "private, no-store" : "public, max-age=60";
  return Response.json({ generatedAt: new Date().toISOString(), targets: out, telemetry }, { headers: { "Cache-Control": cache } });
}
