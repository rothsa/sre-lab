# SRE Lab

A reliability-first lab, live at **lab.sallyroth.dev**: small, working SRE tools (an SLO burn simulator, Down or Me uptime triage, The Incident Files postmortem search, agent evals) and illustrated, step-through explainers on incident management, observability, Kubernetes, Linux, infrastructure as code, delivery and security. Engineering with AI agents is its own section.

## Tools

| Tool | What it does |
|---|---|
| [SLO Burn Simulator](slo/) | Pick an SLO and a burn rate; see how long the error budget lasts, which multi-window burn-rate alerts fire (Google SRE Workbook thresholds), and copy matching Prometheus recording and alerting rules (one page alert and one ticket alert per service). Static page, no backend. |
| [Down or Me](status/) | Uptime checks every 5 minutes on a Cloudflare Worker. When something looks unusual, [Jev](https://en.wikipedia.org/wiki/Jev_(AI_model)) classifies the cause (real outage, degraded, monitor-side, planned maintenance, blip) with a confidence score, and an email goes out only for confident, real problems. Uncertain calls are left for a human. |
| [Did the Agent Do It Right?](agent-evals/) | Three simulated agent runs on the same synthetic incident (one correct, one that checks the wrong service but sounds sure, one stuck in a retry loop), judged by their tool-call traces with span-based Pydantic Evals checks, not by how convincing the final explanation sounds. Static page, no LLM, no API calls. |
| [The Incident Files](incidents/) | 318 real public postmortems, searchable by failure mode (an in-browser embedding model plus BM25, merged with reciprocal rank fusion), and nine recurring failure patterns with how companies prevented them. Static page, no backend, no API calls. |

## Explainers

Step-through diagrams rendered from chapter specs in `<topic>/parts/*.js` by the shared engine in `drawn/`. Each chapter has a short summary, gotchas, what breaks at scale, questions to think through, and links to the primary sources it is based on. `<topic>/check.mjs` checks each one (spec integrity, layout, source links); the spec format is in [`k8s/README.md`](k8s/README.md).

| Page | Covers |
|---|---|
| [Kubernetes](k8s/) | 18 chapters: control loop, kubectl apply, scheduling, Services, DNS, storage, autoscaling, RBAC, upgrades, a troubleshooting map |
| [Linux](linux/) | Page cache, the OOM killer, cgroups, a packet's path, conntrack, TCP queues, the first 60 seconds of performance analysis |
| [Incident Management](incident-management/) | The incident program as a system: severity contract, routing and ownership, concurrent incidents, comms and legal clocks, fleet on-call health, learning, follow-through, readiness, metrics |
| [Taming Cardinality](cardinality/) | How labels multiply series and cost, finding the culprit, dropping, aggregating and governing |
| [Terraform, Five Years On](terraform/) | moved/import/removed blocks, checks and tests, OpenTofu, ephemeral values, splitting state |
| [Infrastructure as Code](iac/) | Remote state and locking, modules, environments, plan/apply in CI with policy checks, drift, testing |
| [Delivery](delivery/) | CI as a shared service, build once and promote, GitOps with Argo CD, canaries, feature flags, schema migrations, supply-chain signing, merge queues |
| [Observability](observability/) | OpenTelemetry and the Collector, Prometheus scraping and PromQL, tracing and sampling, Loki, alerting |
| [Security at Scale](security/) | Org guardrails and policy as code, federated identity, secrets and supply chain programs, vulnerability flow, fleet detection, agents, program metrics |
| [Ownership](ownership/) | How large companies decide and keep track of who owns code and services (single page) |
| [Security](security/) | Org guardrails and policy as code, federated identity, secrets and supply chain programs, vulnerability flow, fleet detection, agents, program metrics |
| [One Pattern, Three Languages](patterns/) | Everyday SRE tasks in Python, Go and Ruby, side by side |
| [Ownership at Scale](ownership/) | How large companies decide and keep track of who owns code and services (single page) |

### AI engineering

| Page | Covers |
|---|---|
| [Agentic Engineering](agentic/) | Harnesses, verification, review, sandboxes and scoped credentials for running many coding agents |
| [Engineering for the Next Agent](next-agent/) | Building for future models: evals, safe model upgrades, durable interfaces |
| [Engineering on an Exponential](exponential/) | Planning horizons and the invariants that hold while model capability moves fast |
| [Graphs and Loops](loops/) | Writing the loops and graphs that drive agents, with checks and stop conditions |
| [One Agent to Hundreds](fleet/) | A five-stage ladder for scaling coding agents (single page, no diagram engine) |

The full dated changelog of research passes is at [`changelog/`](changelog/index.html). The landing page ([`index.html`](index.html)) shows only the latest three entries: add each new entry at the top of both, and drop the oldest from the landing page. The landing page groups tiles as Start here, Tools, Reliability explainers, and AI engineering. `scripts/stamp-updated.py` restamps each page's "updated" date from git history.

## Checks

```bash
for d in */check.mjs; do (cd "$(dirname "$d")" && node check.mjs) || exit 1; done   # explainer specs
node worker/test-down-or-me.mjs     # Down or Me cron cycle: triage retries, notification (Node 22+)
node worker/test-access.mjs         # private board: Access JWT checks, fails closed
(cd incidents && npm ci && node evalnode.mjs .)                                       # search quality
```

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
- The public board lists only generic services. The private board requires Cloudflare Access: `/private/api/status` verifies the Access JWT (signature, issuer, audience, expiry, owner email) and fails closed (403) unless `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `OWNER_EMAIL` are set. The `cf-access-authenticated-user-email` header alone is never trusted.

## Layout

```
index.html              lab landing page: tools, explainers, latest changelog entries (Cloudflare Pages)
changelog/index.html    full changelog of daily research passes
slo/index.html          SLO Burn Simulator
status/index.html       Down or Me board, public (/status/)
private/status/         Down or Me board, owner only (/private/status/)
agent-evals/            Did the Agent Do It Right? (page, data/, build/ for the Python eval run)
incidents/              The Incident Files (page, data/, build and eval scripts)
functions/              Pages Functions: /api/status, /private/api/status
worker/                 Cloudflare Worker: cron checks, Jev triage, migrations, offline tests
drawn/                  shared diagram engine and styles for the explainers
<topic>/                one explainer each: index.html, parts/*.js, check.mjs
fleet/, ownership/      single-page explainers
scripts/                maintenance (stamp-updated.py)
```

## Hosting

- **Pages project `sre-lab`** serves the pages and the status API (Pages Functions in `functions/`, D1 binding). Custom domain lab.sallyroth.dev via a CNAME at the DNS host.
- **Worker `down-or-me`** runs only the 5-minute cron (no public URL) and writes to the same D1 database.
- **Alerts** are sent with Resend. **The private board** is at `sre-lab-97p.pages.dev/private/status/` behind Cloudflare Access (an Access application on both hostnames for `/private/*`; set `ACCESS_TEAM_DOMAIN` = `<team>.cloudflareaccess.com` and `ACCESS_AUD` = the application AUD tag as Pages env vars).

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

## How Did the Agent Do It Right? works

```
build time (agent-evals/build/run_evals.py, Python)                         browser (agent-evals/index.html)
scripted agents ─► mock tools ─► OTel spans ─► pydantic-evals Dataset ─►    data/results.json ─► runs, traces, checks
                   (execute_tool *)            evaluate_sync + evaluators   data/report.txt (plain-text report)
```

- **Simulated, synthetic:** three made-up incidents × three deterministic Python "agents" (correct, wrong service, retry loop). No LLM, no keys, no API cost; the page is static at runtime and only reads `data/results.json`.
- **Checks read the trace:** `HasMatchingSpan` per case (metrics, logs, deploys checked on the affected service), the built-in `MaxToolCalls`, and custom span-tree evaluators for a retry budget and "no rollback without evidence". Output checks (names the service and cause) count too; a "sounds confident" label is reported but never scored.
- **Offline build:** Logfire is configured with `send_to_logfire=False`, spans stay in memory, and a socket guard fails loudly on any outbound connection. Fake durations keep the output stable; only `generated_at` changes between runs.
- Rebuild (venv lives outside the repo; exact versions in `agent-evals/build/requirements.txt`):
  ```bash
  python3 -m venv ~/.venvs/agent-evals && ~/.venvs/agent-evals/bin/pip install -r agent-evals/build/requirements.txt
  # If venv fails because ensurepip is missing (no python3.12-venv package), create it without pip and bootstrap pip:
  #   python3 -m venv --without-pip ~/.venvs/agent-evals && curl -sS https://bootstrap.pypa.io/get-pip.py | ~/.venvs/agent-evals/bin/python
  ~/.venvs/agent-evals/bin/python agent-evals/build/run_evals.py
  ```
