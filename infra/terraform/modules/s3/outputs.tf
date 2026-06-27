output "invoices_bucket_id" {
  value = aws_s3_bucket.invoices.id
}

output "invoices_bucket_arn" {
  value = aws_s3_bucket.invoices.arn
}

output "invoices_bucket_domain" {
  value = aws_s3_bucket.invoices.bucket_regional_domain_name
}

output "frontend_bucket_id" {
  value = aws_s3_bucket.frontend.id
}

output "frontend_bucket_arn" {
  value = aws_s3_bucket.frontend.arn
}

output "frontend_bucket_domain" {
  value = aws_s3_bucket.frontend.bucket_regional_domain_name
}
