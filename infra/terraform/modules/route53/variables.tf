variable "domain_name" {
  description = "Root domain name (e.g. usemarginly.com)"
  type        = string
}

variable "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  type        = string
}

variable "alb_zone_id" {
  description = "Hosted zone ID of the Application Load Balancer"
  type        = string
}

variable "frontend_cloudfront_domain" {
  description = "Domain name of the frontend CloudFront distribution"
  type        = string
}

variable "frontend_cloudfront_zone_id" {
  description = "Hosted zone ID of the frontend CloudFront distribution"
  type        = string
}

variable "invoices_cloudfront_domain" {
  description = "Domain name of the invoices CloudFront distribution"
  type        = string
}

variable "invoices_cloudfront_zone_id" {
  description = "Hosted zone ID of the invoices CloudFront distribution"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "prod"
}

variable "common_tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
