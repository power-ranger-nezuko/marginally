variable "environment" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "full_scale" {
  description = "When true, create NAT gateways and private app subnets (high-availability mode)."
  type        = bool
  default     = false
}

variable "common_tags" {
  type = map(string)
}
