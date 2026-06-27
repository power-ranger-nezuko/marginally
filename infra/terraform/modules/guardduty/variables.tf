variable "enabled" {
  description = "Create GuardDuty detector and EventBridge forwarding. Controlled by advanced_security flag."
  type        = bool
  default     = false
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "prod"
}

variable "sns_topic_arn" {
  description = "ARN of the SNS topic to forward GuardDuty findings to"
  type        = string
  default     = ""
}

variable "common_tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
