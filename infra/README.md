# infra/: the lab's Cloudflare resources in OpenTofu

The Cloudflare side of lab.sallyroth.dev, adopted into OpenTofu with `import` blocks. The goal is a
plan that changes nothing that already exists. The only intended creates are the Cloudflare Access
application and policy for the private board.

**Status: import and plan only. Nothing here has been applied.** There is no state yet. The first
`tofu apply` (after review) writes the imports into local state and creates the Access app.

- OpenTofu 1.13.1, provider `cloudflare/cloudflare` pinned to exactly 5.28.0 (`.terraform.lock.hcl` is committed).
- State is local only (`terraform.tfstate`, gitignored, along with `.terraform/` and `*.tfvars`).
  Keep it out of the repo: it can contain resource attributes Cloudflare returns. If a second
  person or CI ever applies, move to a remote backend first.

## What is codified

| Resource | Tofu address | How it gets into state |
|---|---|---|
| Pages project `sre-lab` (sre-lab-97p.pages.dev), production branch, compat date, D1 binding | `cloudflare_pages_project.lab` | import, no-op |
| Custom domain lab.sallyroth.dev on the project | `cloudflare_pages_domain.lab` | import, no-op |
| D1 database `down-or-me` (shared by the worker and Pages Functions) | `cloudflare_d1_database.down_or_me` | import, no-op |
| AI Gateway `sre-lab` (Plan B) | `cloudflare_ai_gateway.sre_lab` | import, no-op |
| Access policy: allow only the owner's email | `cloudflare_zero_trust_access_policy.private_board_owner` | **create** |
| Access self-hosted app on `/private/*` (custom domain and pages.dev) | `cloudflare_zero_trust_access_application.private_board` | **create** |

`prevent_destroy` is set on the Pages project, its domain and the D1 database.

## What is not codified, and why

- **DNS.** sallyroth.dev is at Gandi (CNAME `lab` to `sre-lab-97p.pages.dev.`), not Cloudflare, so the
  Cloudflare provider has no zone to manage. Codifying it would need the Gandi provider. That is out of
  scope here.
- **Secrets.** Neither tofu nor its state ever holds a secret value. Pages `env_vars` is in
  `ignore_changes`, so the Pages secrets (`ANTHROPIC_API_KEY`, `PLANB_SALT`, `WORKERS_AI_TOKEN`,
  `OWNER_EMAIL`, `PRIVATE_TARGETS`) and the worker secrets (`JEV_API_KEY`, `RESEND_API_KEY`,
  `NOTIFY_TO`, `PRIVATE_TARGETS`, `BLIZZARD_*`) are still set with `npx wrangler pages secret put` /
  `npx wrangler secret put`. The one exception is the Access policy, which needs the owner email. It
  comes from a variable with no default and is marked sensitive. That puts it in local state, which is
  gitignored.
- **Pages env vars and the AI binding.** The repo's `wrangler.toml` is the Pages project's config file.
  Each `wrangler pages deploy` writes the bindings and `[vars]` (`PLANB_ACCOUNT_ID`) from it. Tofu
  declares the D1 binding and compatibility settings to match. It ignores `env_vars`, `ai_bindings`
  (the live binding is `{"AI": {}}`, and the v5 schema requires a `project_id` in it) and
  `wrangler_config_hash`, so the two tools never fight.
- **Worker script `down-or-me`.** `npx wrangler deploy` uploads it from `worker/wrangler.toml`.
  `cloudflare_workers_script` would need the bundled script in tofu, and every apply would rewrite
  the bindings list, which risks dropping the wrangler-set secrets. One owner per upload: wrangler.
- **Worker cron trigger (`*/5`).** wrangler deploy sets it from `[triggers]`. A tofu resource is drafted in
  `worker.tf` but commented out. With provider 5.28.0, importing `cloudflare_workers_cron_trigger`
  leaves `schedules` null in state, so the plan shows an update (a re-PUT of the same schedule)
  instead of a no-op. Re-test it after a provider bump.
- **Worker `workers.dev` subdomain (disabled).** It is left to `workers_dev = false` in wrangler.toml.
- **D1 schema.** Migrations are in `worker/migrations`, applied with `npx wrangler d1 migrations apply`.

## How to plan (read-only)

```sh
cd infra
export CLOUDFLARE_API_TOKEN="$(cat ~/.secrets/.cloudflare_lab_api_token)"   # never commit or echo it
cp terraform.tfvars.example terraform.tfvars                                # set owner_email (gitignored)
tofu init
tofu plan
```

Expected: `Plan: 4 to import, 2 to add, 0 to change, 0 to destroy.` If an imported resource shows
`update` or `replace`, stop. The live config has drifted from this code, so fix the code (or
find out who changed Cloudflare) before applying.

The lab token can read the Pages, D1, Workers and AI Gateway resources. It can list Access apps, but it
cannot read the Zero Trust organization. Planning the Access creates needs no Access permission.
Applying them does (see below).

CI (`.github/workflows/checks.yml`) runs `tofu fmt -check`, `tofu init -backend=false` and
`tofu validate` with no credentials. It never plans or applies.

## How to apply later, after review

1. Review the plan output above with a human. Destroy must be 0. Imports must be no-op.
2. Do the Access prerequisites (steps 1 and 2 below).
3. `tofu plan -out=lab.tfplan`, read it, then `tofu apply lab.tfplan`. Only a saved plan gets applied.
4. Back up `terraform.tfstate` somewhere private (not this repo).
5. Afterwards, `tofu plan` must report no changes.

## Finishing the private-board Access setup

The private board (`/private/status/`, `/private/api/status`) already verifies the Access JWT in
`worker/src/status.js` (`verifyAccess`). It fails closed with 403 until `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`
and `OWNER_EMAIL` are all set on the Pages project.

1. **Team domain.** Zero Trust dashboard, Settings, Custom Pages / Team domain. If the account has no Zero
   Trust organization yet, create one (the free plan is enough for one user) and pick a team name. The team
   domain is `<team>.cloudflareaccess.com`. Also set up a login method: the built-in one-time PIN to
   email works.
2. **Token.** Give the lab token (or a separate short-lived one) `Access: Apps and Policies Edit` on the
   account. The current lab token cannot create Access apps.
3. **Apply** (see above) with `owner_email` set. Then read the AUD:
   `tofu output -raw access_aud`.
   If Cloudflare rejects the `lab.sallyroth.dev/private/*` destination because the zone is not on
   Cloudflare, set `access_on_custom_domain = false` in `terraform.tfvars` and plan/apply again. The board
   is then reachable only at `https://sre-lab-97p.pages.dev/private/status/`. On the custom domain it
   answers 403 (no JWT), which is the safe failure.
4. **Pages env vars.** Neither value is a secret (the AUD is in every Access JWT). Setting them as
   encrypted Pages secrets keeps them out of the public repo, and tofu ignores `env_vars`, so nothing fights:
   ```sh
   export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
   export CLOUDFLARE_ACCOUNT_ID=983a6e91a3bea9819abb6c98447f3b01
   printf '%s' '<team>.cloudflareaccess.com' | npx wrangler pages secret put ACCESS_TEAM_DOMAIN --project-name sre-lab
   tofu -chdir=infra output -raw access_aud | npx wrangler pages secret put ACCESS_AUD --project-name sre-lab
   printf '%s' 'owner@...' | npx wrangler pages secret put OWNER_EMAIL --project-name sre-lab
   npx wrangler pages secret put PRIVATE_TARGETS --project-name sre-lab < ~/.config/down-or-me/private-targets.json
   ```
   `ACCESS_TEAM_DOMAIN` is the bare hostname, with no `https://` (status.js builds
   `https://${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`). As of this PR, the Pages production
   environment has no `OWNER_EMAIL` or `PRIVATE_TARGETS` yet, only the three Plan B secrets.
   An alternative is to put `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.toml` `[vars]`. They are
   then versioned with the code, but they are public in the repo and on the next deploy.
5. **Redeploy.** Pages env changes apply to new deployments only. Redeploy the committed tree the usual way
   (`git archive HEAD` into a temp dir, then `npx wrangler@4 pages deploy . --project-name sre-lab --branch main`).
6. **Verify.**
   - `curl -sI https://sre-lab-97p.pages.dev/private/api/status` should redirect to the Access login
     (302 to `<team>.cloudflareaccess.com`), not return 200 or the old 403.
   - Log in as the owner in a browser. `/private/status/` shows the private targets.
   - A request with only a forged `cf-access-authenticated-user-email` header still gets 403.
