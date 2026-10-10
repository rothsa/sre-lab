// Plan B spike: calls a running `wrangler pages dev` (or any deployment) once per mode and prints
// what came back. Costs: 1 Workers AI call (healthy) + up to 2 Anthropic Haiku calls (down, slow).
// It never reads or prints keys. Set PLANB_DEBUG=1 in .dev.vars to also see the gateway's
// cf-aig-* response headers (cf-aig-step, cf-aig-log-id), which is what the spike is for.
//   node worker/spike-planb.mjs [baseUrl] [incident]
//   node worker/spike-planb.mjs http://localhost:8788 1
const base = (process.argv[2] || "http://localhost:8788").replace(/\/$/, "");
const incident = Number(process.argv[3] || 1);
const url = `${base}/api/planb`;

async function call(init) {
  const t0 = Date.now();
  const res = await fetch(url, init);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { nonJson: text.slice(0, 200) }; }
  return { status: res.status, cache: res.headers.get("cache-control"), clientMs: Date.now() - t0, body };
}

console.log(`Plan B spike against ${url}, incident ${incident}\n`);

// Cheap sanity checks first (no AI call is made for these).
for (const [label, init] of [
  ["GET (expect 405)", { method: "GET" }],
  ["bad mode (expect 400)", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ incident, mode: "on-fire" }) }],
]) {
  const r = await call(init);
  console.log(`${label}: HTTP ${r.status} · ${r.body?.error?.code ?? "?"} · cache-control=${r.cache}`);
}
console.log("");

for (const mode of ["healthy", "down", "slow"]) {
  const r = await call({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ incident, mode }) });
  const b = r.body || {};
  console.log(`== ${mode}: HTTP ${r.status} · cache-control=${r.cache} · client ${r.clientMs} ms`);
  if (b.error) console.log(`   error: ${b.error.code}: ${b.error.message}`);
  if (b.answeredBy) console.log(`   answeredBy=${b.answeredBy} model=${b.model} step=${b.step} (from ${b.stepSource}) totalMs=${b.totalMs}`);
  for (const a of b.attempts || []) console.log(`   step ${a.step} ${a.provider} ${a.model}: ${a.outcome}${a.note ? ` (${a.note})` : ""} · ${a.ms ?? "?"} ms${a.timing ? ` [${a.timing}]` : ""}`);
  if (b.capNote) console.log(`   capNote: ${b.capNote}`);
  if (b.debug) console.log(`   debug: ${JSON.stringify(b.debug)}`);
  if (b.text) console.log(`   text (${b.text.length} chars): ${b.text.replace(/\s+/g, " ").slice(0, 140)}`);
  console.log("");
}
console.log("Expect: healthy -> step 0 workers-ai; down and slow -> step 1 anthropic. If debug.headers has no cf-aig-step,");
console.log("the step came from the response shape. If down/slow come back as all_steps_failed, the fallback did not trigger.");
