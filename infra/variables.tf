variable "account_id" {
  description = "Cloudflare account that owns the lab. Not a secret (it is also in wrangler.toml)."
  type        = string
  default     = "983a6e91a3bea9819abb6c98447f3b01"
}

variable "pages_project_name" {
  description = "Cloudflare Pages project that serves the lab."
  type        = string
  default     = "sre-lab"
}

variable "custom_domain" {
  description = "Custom domain on the Pages project. DNS for it lives at Gandi (CNAME to the pages.dev subdomain), not in Cloudflare."
  type        = string
  default     = "lab.sallyroth.dev"
}

variable "d1_database_id" {
  description = "D1 database shared by the Pages Functions and the down-or-me worker."
  type        = string
  default     = "f746c8d5-340e-42e5-ad68-ce312cd8def8"
}

variable "worker_name" {
  description = "Cron worker whose code is uploaded by wrangler (worker/wrangler.toml)."
  type        = string
  default     = "down-or-me"
}

variable "owner_email" {
  description = "The only identity the Access policy allows onto /private/*. Set it in terraform.tfvars (gitignored) or TF_VAR_owner_email. No default on purpose."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.owner_email))
    error_message = "owner_email must be an email address."
  }
}

variable "access_on_custom_domain" {
  description = "Also put the Access app on <custom_domain>/private/*. May be rejected because the zone is not on Cloudflare; see access.tf."
  type        = bool
  default     = true
}

variable "access_session_duration" {
  description = "How long an Access login for the private board lasts."
  type        = string
  default     = "24h"
}
