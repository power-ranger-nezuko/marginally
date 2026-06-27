output "regional_acl_arn" {
  value = var.enabled ? aws_wafv2_web_acl.regional[0].arn : null
}

output "cloudfront_acl_arn" {
  value = var.enabled ? aws_wafv2_web_acl.cloudfront[0].arn : null
}
