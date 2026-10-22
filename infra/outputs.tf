output "pages_subdomain" {
  description = "pages.dev hostname; the Gandi CNAME for the custom domain points here."
  value       = cloudflare_pages_project.lab.subdomain
}

output "access_aud" {
  description = "Application Audience (AUD) tag of the private-board Access app. Goes into the Pages var ACCESS_AUD. Known only after apply."
  value       = cloudflare_zero_trust_access_application.private_board.aud
}

output "access_app_id" {
  description = "Access application id."
  value       = cloudflare_zero_trust_access_application.private_board.id
}
