# SRE Lab

Small, working reliability-engineering tools, live at **lab.sallyroth.dev**.

| Tool | What it does |
|---|---|
| [SLO Burn Simulator](slo/) | Pick an SLO and a burn rate; see how long the error budget lasts, which multi-window burn-rate alerts fire (Google SRE Workbook thresholds), and copy matching Prometheus rules. Static page, no backend. |
| [The Incident Files](incidents/) | 310 real public postmortems, searchable by failure mode (an in-browser embedding model plus BM25, merged with reciprocal rank fusion), and nine recurring failure patterns with how companies prevented them. Static page, no backend, no API calls. |
| [Kubernetes, Drawn](k8s/) | How Kubernetes works in 18 step-through diagrams (control loop, kubectl apply, scheduling, Services, DNS, storage, autoscaling, RBAC, upgrades, a troubleshooting map), each with a 30-second answer, gotchas, a quiz and links to the kubernetes.io pages it's based on. Static page; chapter specs in `k8s/parts/`, checks in `k8s/check.mjs`. |
| [Down or Me](status/) | Uptime checks every 5 minutes on a Cloudflare Worker. When something looks unusual, [Jev](https://en.wikipedia.org/wiki/Jev_(AI_model)) classifies the cause (real outage, degraded, monitor-side, planned maintenance, blip) with a confidence score, and an email goes out only for confident, real problems. Uncertain calls are left for a human. |
| [Plan B](planb/) | AI failover you can break on purpose: pick a fictional incident, break the primary model (bad model id or a 1 ms timeout) and watch AI Gateway fall back from Workers AI to Claude on Anthropic, with which step answered and how long each attempt took. Pages Function + D1 caps; keys stay server-side. |

## How Down or Me works

```
cron (5 min) ─► HTTP / status-page / game-server checks ─► D1 history
                     │
               unusual? ── no ─► done (no AI call)
                     │ yes, first time or every 30 min while it lasts
               daily Jev budget left? ── no ─► show on board only
                     │ yes
               Jev: cause + confidence + "notify?" ─► D1 verdict
                     │
               confident, real, not already sent ─► email
```

- Jev is called only from the Worker. The API key is a Wrangler secret and never reaches the browser.
- A daily cap (`JEV_DAILY_CAP`, default 200) bounds cost even if something loops.
- The public board lists only generic services; the private board sits behind Cloudflare Access.

## How Plan B works

```
page ─► POST /api/planb {incident, mode} ─► Pages Function: validate · per-IP limit · daily caps
                                                   │
                                     env.AI.gateway("sre-lab").run([step0, step1])   (Universal Endpoint)
                                                   │
                         step 0: Workers AI @cf/meta/llama-3.2-3b-instruct (1 attempt)
                                                   │ error or timeout
                         step 1: Anthropic v1/messages claude-haiku-5-5
```

- **Breaking it:** `down` sends step 0 to a model id that doesn't exist; `slow` gives step 0 a 1 ms timeout. Step 0 never retries, so the fallback is visible. Gateway cache is skipped on every run.
- **Which model answered:** the gateway's `cf-aig-step` response header when present, otherwise the response shape (Anthropic `type: "message"` + `content[]` vs Workers AI `result.response`). The response says which (`stepSource`).
- **Timings:** `totalMs` is measured around the gateway call. When the backup answers, its own time comes from the gateway log (`getLog`) when readable, and the failed attempt is total minus that; otherwise shown as unknown.
- **No free text:** three fixed fictional incidents and a fixed prompt; the body must be exactly `{incident: 1|2|3, mode: "healthy"|"down"|"slow"}`.
- **Honest limit:** the function and the gateway run on Cloudflare, so this shows recovery from a failed model request, not surviving a Cloudflare-wide outage. The page says so.
- Code: `worker/src/planb.js` (logic), `functions/api/planb.js` (route), `planb/index.html` (page), `worker/migrations/0003_planb.sql` (tables).

### Costs and guardrails

| Guardrail | Default | Override (Pages env var) |
|---|---|---|
| Per visitor | 10 runs / 10 min, keyed by SHA-256(salt, UTC day, IP); raw IPs never stored, rows pruned after a day | `PLANB_IP_LIMIT`, `PLANB_IP_WINDOW_MIN` |
| Daily runs (all visitors) | 300, atomic D1 counter (same pattern as `takeJevBudget`) | `PLANB_DAILY_RUNS` |
| Daily Anthropic rescues | 100; broken modes reserve one before calling, healthy runs include the backup only while under the cap | `PLANB_DAILY_RESCUES` |
| Answer length | `max_tokens` 200 | none |
| Gateway rate limit | second net, set in the gateway's settings | dashboard |

Workers AI for a run this size is a tiny fraction of the free daily neuron allowance. Claude Haiku 5.5 is $0.10 / $0.50 per million input / output tokens, so a rescue (~250 in, ≤200 out) costs about $0.0001 and 100 rescues a day about one cent. Use a dedicated Anthropic key with a low spend limit.

### Setup (owner, once)

1. Dashboard → AI → AI Gateway: create gateway **`sre-lab`** with rate limiting on.
2. Secrets on the Pages project (never committed), each read from a file:
   ```bash
   npx wrangler pages secret put ANTHROPIC_API_KEY --project-name sre-lab < ~/.secrets/.anthropic_lab_key
   openssl rand -hex 32 | npx wrangler pages secret put PLANB_SALT --project-name sre-lab
   ```
3. Migration (same flow as Down or Me): `cd worker && npx wrangler d1 migrations apply down-or-me --remote`
4. Optional `WORKERS_AI_TOKEN` only if the spike shows the workers-ai step needs a Cloudflare API token.

### Testing

- Offline (no network, no AI calls; node:sqlite stands in for D1 and runs the real migration): `node worker/test-planb.mjs`
- Spike against `wrangler pages dev` (real gateway; costs one Workers AI call and up to two Haiku calls). `.dev.vars` is gitignored:
  ```bash
  (umask 077; { printf 'ANTHROPIC_API_KEY='; tr -d '\r\n' < ~/.secrets/.anthropic_lab_key; printf '\nPLANB_DEBUG=1\n'; } > .dev.vars)
  npx wrangler d1 execute down-or-me --local --file worker/migrations/0003_planb.sql
  npx wrangler pages dev . --port 8788          # in one terminal
  node worker/spike-planb.mjs http://localhost:8788 1   # in another
  ```
  `PLANB_DEBUG=1` adds the gateway's `cf-aig-*` response headers to the JSON so you can see whether `cf-aig-step` came through. Never set it on the Pages project.

## Layout

```
index.html          lab landing page (Cloudflare Pages)
slo/index.html      SLO Burn Simulator
status/index.html   Down or Me board (public at /status/, private at /private/status/)
planb/index.html    Plan B failover demo (API: functions/api/planb.js -> worker/src/planb.js)
worker/             Cloudflare Worker: cron checks, Jev triage, status API
```

## Hosting

- **Pages project `sre-lab`** serves the pages and the status API (Pages Functions in `functions/`, D1 binding). Custom domain lab.sallyroth.dev via a CNAME at the DNS host.
- **Worker `down-or-me`** runs only the 5-minute cron (no public URL) and writes to the same D1 database.
- **Alerts** are sent with Resend. **The private board** is at `sre-lab-97p.pages.dev/private/status/` behind Cloudflare Access.

## Setup (owner)

```bash
npx wrangler d1 create down-or-me          # paste the id into both wrangler.toml files
cd worker
npx wrangler d1 migrations apply down-or-me --remote
npx wrangler secret put JEV_API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put NOTIFY_TO
npx wrangler secret put PRIVATE_TARGETS
npx wrangler deploy
cd ..
npx wrangler pages deploy .                # then set PRIVATE_TARGETS and OWNER_EMAIL on the Pages project
```

## How The Incident Files works

```
build time (incidents/build.mjs, Node)          browser (incidents/index.html)
incidents.json ─► all-MiniLM-L6-v2 (q8) ─►      query ─► same model ─► 384-dim vector ─► dot product ─► top 5
                  embeddings.bin (384-dim)       query ─► BM25 over the same text ───────────────────────► top 5
```

- **Corpus:** real public postmortems, found through [danluu/post-mortems](https://github.com/danluu/post-mortems). Each entry holds facts (company, date, trigger, impact, detection, fix) and a short summary written for this demo, plus a link to the original. No text is copied from the sources.
- **Same model at build time and in the browser**, pinned to Transformers.js 3.8.1, so query and document vectors are comparable.
- **Ranking:** the embedding model matches by meaning, BM25 catches exact terms; reciprocal rank fusion merges them, with keyword ranks at half weight so one shared word can't outvote meaning. `incidents/data/eval.json` and `node evalnode.mjs .` score it offline.
- **Patterns (`incidents/data/patterns.json`):** recurring failure modes proposed by the embedding model and confirmed by hand; each prevention cites the incidents whose own follow-ups it comes from.
- Rebuild after editing the corpus: `cd incidents && npm install && node build.mjs --check`, then `node evalnode.mjs .` to score AI, keyword and hybrid search offline.

