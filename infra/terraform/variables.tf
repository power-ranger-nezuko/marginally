variable "environment" {
  description = "Deployment environment"
  type        = string
  validation {
    condition     = contains(["prod", "staging"], var.environment)
    error_message = "environment must be 'prod' or 'staging'."
  }
}

variable "aws_region" {
  description = "AWS region for primary deployment"
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Root domain name (e.g. usemarginly.com)"
  type        = string
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "app_image_tag" {
  description = "Docker image tag for the application containers"
  type        = string
  default     = "latest"
}

variable "alert_email" {
  description = "Email address for CloudWatch alarm SNS notifications"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "lean_scale" {
  description = "Cost-optimised mode: ECS tasks in public subnets (no NAT gateways), single-AZ RDS, 1 Redis node. Mutually exclusive with full_scale."
  type        = bool
  default     = true
}

variable "full_scale" {
  description = "High-availability mode: 2 NAT gateways, ECS in private subnets, multi-AZ RDS, 2 Redis nodes. Mutually exclusive with lean_scale."
  type        = bool
  default     = false
}

variable "advanced_security" {
  description = "Advanced security features: WAF (Regional + CloudFront), GuardDuty, CloudTrail. Can be combined with either scale mode."
  type        = bool
  default     = false
}
