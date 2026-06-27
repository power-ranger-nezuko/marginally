variable "domain_name" {
  description = "Primary domain name for the ACM certificate"
  type        = string
}

variable "zone_id" {
  description = "Route53 hosted zone ID for DNS validation records"
  type        = string
}

variable "common_tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
