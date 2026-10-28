# AI Gateway used by Plan B (functions/api/planb.js): env.AI.gateway("sre-lab") and the REST endpoint.
# Values mirror the live gateway so the import is a no-op.

resource "cloudflare_ai_gateway" "sre_lab" {
  account_id = var.account_id
  id         = "sre-lab"

  cache_invalidate_on_update = false
  cache_ttl                  = 0
  collect_logs               = true
  rate_limiting_interval     = 60
  rate_limiting_limit        = 60
  rate_limiting_technique    = "sliding"
  log_management             = 10000000
  log_management_strategy    = "DELETE_OLDEST"
  authentication             = false
  logpush                    = false
  byok_only                  = false
  zdr                        = false
  log_classification         = false
  workers_ai_billing_mode    = "postpaid"
}
