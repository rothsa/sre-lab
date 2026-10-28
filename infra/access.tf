# Cloudflare Access in front of the private board (/private/*). NEW: this is the only intended create.
# Pairs with verifyAccess() in worker/src/status.js, which checks the Cf-Access-Jwt-Assertion against the
# team's JWKS and needs ACCESS_TEAM_DOMAIN + ACCESS_AUD (the aud output below) in the Pages project.
# Prerequisites before apply: a Zero Trust organization (team domain) on the account, and a token with
# Access: Apps and Policies Edit. See README.md "Finishing the private-board Access setup".

resource "cloudflare_zero_trust_access_policy" "private_board_owner" {
  account_id = var.account_id
  name       = "sre-lab private board: owner only"
  decision   = "allow"

  include = [
    { email = { email = var.owner_email } },
  ]
}

resource "cloudflare_zero_trust_access_application" "private_board" {
  account_id       = var.account_id
  name             = "sre-lab private board"
  type             = "self_hosted"
  session_duration = var.access_session_duration

  # The sallyroth.dev zone is not on Cloudflare (DNS at Gandi). If Cloudflare refuses the custom-domain
  # destination on apply, set access_on_custom_domain = false: /private/* on the custom domain then has no
  # Access JWT and verifyAccess() answers 403 there, so the board is reachable only via pages.dev.
  destinations = concat(
    var.access_on_custom_domain ? [{ type = "public", uri = "${var.custom_domain}/private/*" }] : [],
    [{ type = "public", uri = "${cloudflare_pages_project.lab.subdomain}/private/*" }],
  )

  policies = [
    { id = cloudflare_zero_trust_access_policy.private_board_owner.id, precedence = 1 },
  ]

  auto_redirect_to_identity = false
  app_launcher_visible      = false
}
