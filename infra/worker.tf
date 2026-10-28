# Worker "down-or-me": NOT codified here. Wrangler owns all of it.
#
# - Script body, bindings, [vars] and secrets: uploaded by `npx wrangler deploy` from worker/wrangler.toml.
#   cloudflare_workers_script would need the bundled script content in tofu and, on every apply, would
#   rewrite the bindings list, which risks dropping the wrangler-set secrets (JEV_API_KEY, RESEND_API_KEY,
#   NOTIFY_TO, PRIVATE_TARGETS, BLIZZARD_*). Two tools owning one upload is a fight; wrangler wins.
# - Cron trigger (*/5): wrangler deploy writes it from [triggers] crons. The intended tofu resource is
#   below, commented out: with provider 5.28.0, importing cloudflare_workers_cron_trigger leaves
#   `schedules` null in state, so the plan shows an in-place update (a PUT of the same */5 schedule)
#   instead of a no-op. Harmless, but the goal of this directory is a zero-change import, so it stays out
#   until the provider reads schedules back on import. Re-test with:
#     uncomment both blocks, then `tofu plan` must say the cron trigger "will be imported" with no change.
#
# import {
#   to = cloudflare_workers_cron_trigger.down_or_me
#   id = "${var.account_id}/${var.worker_name}"
# }
#
# resource "cloudflare_workers_cron_trigger" "down_or_me" {
#   account_id  = var.account_id
#   script_name = var.worker_name
#   schedules   = [{ cron = "*/5 * * * *" }]
# }

# D1 database shared by the worker (writes) and the Pages Functions (reads). The schema lives in
# worker/migrations and is applied with `npx wrangler d1 migrations apply`; tofu only owns the database.
resource "cloudflare_d1_database" "down_or_me" {
  account_id = var.account_id
  name       = "down-or-me"

  read_replication = {
    mode = "disabled"
  }

  lifecycle {
    prevent_destroy = true
  }
}
