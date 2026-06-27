variable "enabled" {
  description = "Create WAF Web ACLs. Controlled by the advanced_security flag."
  type        = bool
  default     = false
}

variable "environment" {
  type = string
}

variable "common_tags" {
  type = map(string)
}
