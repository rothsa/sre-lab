# SRE Lab

Small, working reliability-engineering tools, live at **lab.sallyroth.dev**.

| Tool | What it does |
|---|---|
| [SLO Burn Simulator](slo/) | Pick an SLO and a burn rate; see how long the error budget lasts, which multi-window burn-rate alerts fire (Google SRE Workbook thresholds), and copy matching Prometheus rules. Static page, no backend. |
| [Down or Me](status/) | Uptime checks every 5 minutes on a Cloudflare Worker. When something looks unusual, [Jev](https://en.wikipedia.org/wiki/Jev_(AI_model)) classifies the cause (real outage, degraded, monitor-side, planned maintenance, blip) with a confidence score, and an email goes out only for confident, real problems. Uncertain calls are left for a human. |

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

## Layout

```
index.html          lab landing page (Cloudflare Pages)
slo/index.html      SLO Burn Simulator
status/index.html   Down or Me board (public at /status/, private at /private/status/)
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
