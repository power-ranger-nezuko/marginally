output "frontend_domain" {
  value = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_zone_id" {
  value = aws_cloudfront_distribution.frontend.hosted_zone_id
}

output "invoices_domain" {
  value = aws_cloudfront_distribution.invoices.domain_name
}

output "invoices_zone_id" {
  value = aws_cloudfront_distribution.invoices.hosted_zone_id
}

output "frontend_oai_iam_arn" {
  value = aws_cloudfront_origin_access_identity.frontend.iam_arn
}

output "invoices_oai_iam_arn" {
  value = aws_cloudfront_origin_access_identity.invoices.iam_arn
}
