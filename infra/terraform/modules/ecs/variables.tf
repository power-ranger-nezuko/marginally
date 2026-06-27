variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "account_id" {
  type = string
}

variable "app_image_tag" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "task_subnet_ids" {
  description = "Subnets for ECS tasks. Public subnets in lean_scale, private app subnets in full_scale."
  type        = list(string)
}

variable "assign_public_ip" {
  description = "Assign a public IP to ECS task ENIs. True in lean_scale (no NAT), false in full_scale."
  type        = bool
  default     = true
}

variable "routing_dependency_ids" {
  description = "Private app route table association IDs. Passed so ECS services wait for NAT routing to be ready before rolling into private subnets on lean → full transition."
  type        = list(string)
  default     = []
}

variable "app_sg_id" {
  type = string
}

variable "alb_target_group_arn" {
  type = string
}

variable "api_task_role_arn" {
  type = string
}

variable "worker_task_role_arn" {
  type = string
}

variable "pdf_task_role_arn" {
  type = string
}

variable "execution_role_arn" {
  type = string
}

variable "secrets" {
  type      = map(string)
  sensitive = true
}

variable "webhook_queue_url" {
  type = string
}

variable "alb_arn_suffix" {
  type = string
}

variable "target_group_arn_suffix" {
  type = string
}

variable "full_scale" {
  description = "Enable Container Insights on the ECS cluster. In lean_scale this is false to avoid per-metric CloudWatch costs."
  type        = bool
  default     = false
}

variable "domain_name" {
  type = string
}

variable "common_tags" {
  type = map(string)
}
