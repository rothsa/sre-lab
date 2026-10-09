// Status API, shared by the Pages Functions at /api/status and /private/api/status.
import { allTargets } from "./targets.js";

export async function statusApi(req, env, wantPrivate) {
  if (wantPrivate) {
    // Cloudflare Access sets this header after login; only the owner gets the private list.
    const who = req.headers.get("cf-access-authenticated-user-email");
    if (!who || !env.OWNER_EMAIL || who.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) {
      return new Response("Forbidden", { status: 403 });
    }
  }
  const targets = allTargets(env).filter((t) => wantPrivate || t.public);
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
  return Response.json({ generatedAt: new Date().toISOString(), targets: out }, { headers: { "Cache-Control": "public, max-age=60" } });
}
