output "trail_arn" {
  description = "ARN of the CloudTrail trail, or null when advanced_security is disabled."
  value       = var.enabled ? aws_cloudtrail.main[0].arn : null
}

output "log_bucket_name" {
  description = "Name of the S3 bucket storing CloudTrail logs, or null when advanced_security is disabled."
  value       = var.enabled ? aws_s3_bucket.cloudtrail_logs[0].id : null
}
