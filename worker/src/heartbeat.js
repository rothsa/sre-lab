// Push-based checks (kind "heartbeat") for hosts the worker can't reach, such as a server that
// is only on a private network. The host checks itself every few minutes and POSTs the result
// to /api/heartbeat (a Pages Function); each cron cycle the worker reads the latest report and
// marks the target down when the reports stop or say the host's own check failed.

const DEFAULT_MAX_AGE_MIN = 12; // hosts report every 5 minutes, so one missed report is tolerated
const MAX_BODY = 1024;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const noStore = { "Cache-Control": "no-store" };
const reply = (status, text) => new Response(text, { status, headers: noStore });

// Compares SHA-256 digests byte by byte, so the time taken doesn't depend on where the
// strings differ or how long they are.
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = (await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))))).map((d) => new Uint8Array(d));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// Pages Function handler. Fails closed: without a HEARTBEAT_TOKEN of at least 32 characters
// nothing is accepted. Only targets the worker has registered as kind "heartbeat" can be written.
export async function heartbeatIntake(request, env) {
  const secret = (env.HEARTBEAT_TOKEN || "").trim();
  if (secret.length < 32) return reply(503, "Not configured");
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !(await sameSecret(token, secret))) return reply(401, "Unauthorized");

  const text = await request.text();
  if (text.length > MAX_BODY) return reply(413, "Too large");
  let body;
  try { body = JSON.parse(text); } catch { return reply(400, "Bad JSON"); }
  if (typeof body?.target !== "string" || !ID.test(body.target) || typeof body.ok !== "boolean") return reply(400, "Bad request");
  const known = await env.DB.prepare("SELECT 1 FROM targets WHERE id = ? AND kind = 'heartbeat'").bind(body.target).first();
  if (!known) return reply(404, "Unknown target");

  const detail = typeof body.detail === "string" ? body.detail.slice(0, 200) : null;
  await env.DB.prepare("INSERT INTO heartbeats (target, last_seen, ok, detail) VALUES (?, ?, ?, ?) ON CONFLICT(target) DO UPDATE SET last_seen = excluded.last_seen, ok = excluded.ok, detail = excluded.detail")
    .bind(body.target, Date.now(), body.ok ? 1 : 0, detail).run();
  return new Response(null, { status: 204, headers: noStore });
}

// Worker check. Skipped until the first report arrives, so a new target doesn't alert while
// its host is still being set up; after that, silence counts as down.
export async function heartbeatCheck(t, env) {
  const hb = await env.DB.prepare("SELECT last_seen, ok, detail FROM heartbeats WHERE target = ?").bind(t.id).first();
  if (!hb) return { skipped: true };
  const ageMin = Math.round((Date.now() - hb.last_seen) / 60_000);
  if (ageMin > (t.maxAgeMinutes || DEFAULT_MAX_AGE_MIN)) {
    return { ok: false, status: "stale", detail: `no heartbeat for ${ageMin} min; last report: ${hb.detail ?? (hb.ok ? "ok" : "failing")}` };
  }
  return hb.ok ? { ok: true, status: "online", detail: hb.detail } : { ok: false, status: "reported-down", detail: hb.detail };
}
