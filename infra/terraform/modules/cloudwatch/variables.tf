variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
}

variable "rds_identifier" {
  description = "RDS instance identifier"
  type        = string
}

variable "webhook_dlq_name" {
  description = "Name of the SQS dead-letter queue for webhooks"
  type        = string
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch metric dimensions"
  type        = string
}

variable "target_group_arn_suffix" {
  description = "ALB target group ARN suffix for CloudWatch metric dimensions"
  type        = string
}

variable "alert_email" {
  description = "Email address to receive SNS alarm notifications"
  type        = string
}

variable "api_log_group_name" {
  description = "CloudWatch log group name for the API container. Passed from the ECS module so metric filters target the correct group."
  type        = string
}

variable "api_service_name" {
  description = "ECS service name for the API service. Used in CloudWatch alarm dimensions."
  type        = string
}

variable "log_retention_days" {
  description = "Number of days to retain CloudWatch log groups"
  type        = number
  default     = 30
}

variable "common_tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
