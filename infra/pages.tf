# Pages project "sre-lab": direct upload (no Git source), deployed by `npx wrangler pages deploy`.
#
# Ownership split, so tofu and wrangler never fight:
#   - tofu owns: the project itself, production branch, the custom domain.
#   - wrangler.toml (repo root) owns, at every deploy: compatibility date/flags, D1 + AI bindings, [vars].
#     The bindings below are written to match it so the import is a no-op and the plan documents them.
#   - Secrets (ANTHROPIC_API_KEY, PLANB_SALT, WORKERS_AI_TOKEN, OWNER_EMAIL, PRIVATE_TARGETS, ...) are
#     set with `npx wrangler pages secret put` and are never read or written here: env_vars is ignored.

locals {
  pages_env = {
    compatibility_date                   = "2026-09-01"
    always_use_latest_compatibility_date = false
    fail_open                            = true
    build_image_major_version            = 3
    d1_databases                         = { DB = { id = var.d1_database_id } }
  }
}

resource "cloudflare_pages_project" "lab" {
  account_id        = var.account_id
  name              = var.pages_project_name
  production_branch = "main"

  # build_config and compatibility_flags are left unset: the API returns them empty and the provider reads
  # them back as null, so declaring "" / [] would plan a spurious change.
  deployment_configs = {
    production = local.pages_env
    preview    = local.pages_env
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      # Secrets and wrangler.toml [vars] live outside tofu (see header comment and README).
      deployment_configs.production.env_vars,
      deployment_configs.preview.env_vars,
      # The live AI binding is {"AI": {}}; the v5 schema requires a project_id inside it, so declaring it
      # would plan a change. wrangler.toml [ai] owns it.
      deployment_configs.production.ai_bindings,
      deployment_configs.preview.ai_bindings,
      # Written by wrangler on every deploy.
      deployment_configs.production.wrangler_config_hash,
      deployment_configs.preview.wrangler_config_hash,
    ]
  }
}

resource "cloudflare_pages_domain" "lab" {
  account_id   = var.account_id
  project_name = cloudflare_pages_project.lab.name
  name         = var.custom_domain

  lifecycle {
    prevent_destroy = true
  }
}
