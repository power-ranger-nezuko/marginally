variable "environment" {
  type = string
}

variable "frontend_bucket_id" {
  type = string
}

variable "frontend_bucket_domain" {
  type = string
}

variable "invoices_bucket_id" {
  type = string
}

variable "invoices_bucket_domain" {
  type = string
}

variable "waf_acl_arn" {
  description = "CloudFront WAF Web ACL ARN. Null when advanced_security is disabled (CloudFront web_acl_id is omitted)."
  type        = string
  default     = null
}

variable "certificate_arn" {
  type = string
}

variable "domain_name" {
  type = string
}

variable "cloudfront_public_key_pem" {
  description = "RSA public key PEM for CloudFront signed URLs (invoices). Set before first deploy."
  type        = string
  default     = ""
  sensitive   = true
}

variable "common_tags" {
  type = map(string)
}
