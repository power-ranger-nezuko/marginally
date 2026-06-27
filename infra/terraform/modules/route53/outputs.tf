output "zone_id" {
  description = "Route53 hosted zone ID"
  value       = data.aws_route53_zone.main.zone_id
}

output "api_fqdn" {
  description = "Fully qualified domain name for the API endpoint"
  value       = aws_route53_record.api.fqdn
}

output "app_fqdn" {
  description = "Fully qualified domain name for the frontend app"
  value       = aws_route53_record.app.fqdn
}

output "invoices_fqdn" {
  description = "Fully qualified domain name for the invoices endpoint"
  value       = aws_route53_record.invoices.fqdn
}
