variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "alb_sg_id" {
  type = string
}

variable "certificate_arn" {
  type = string
}

variable "waf_acl_arn" {
  description = "Regional WAF Web ACL ARN to associate with the ALB. Null when advanced_security is disabled."
  type        = string
  default     = null
}

variable "full_scale" {
  description = "Enable ALB access logs. In lean_scale this is false to avoid S3 log storage costs."
  type        = bool
  default     = false
}

variable "common_tags" {
  type = map(string)
}
