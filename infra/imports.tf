# Existing resources, adopted into state by `tofu plan` / `tofu apply` without changing them.
# Import ID formats are from the cloudflare/cloudflare v5 provider docs.

import {
  to = cloudflare_pages_project.lab
  id = "${var.account_id}/${var.pages_project_name}"
}

import {
  to = cloudflare_pages_domain.lab
  id = "${var.account_id}/${var.pages_project_name}/${var.custom_domain}"
}

import {
  to = cloudflare_d1_database.down_or_me
  id = "${var.account_id}/${var.d1_database_id}"
}

import {
  to = cloudflare_ai_gateway.sre_lab
  id = "${var.account_id}/sre-lab"
}
