variable "enabled" {
  description = "Create CloudTrail trail, S3 bucket, and CloudWatch log group. Controlled by advanced_security flag."
  type        = bool
  default     = false
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "account_id" {
  description = "AWS account ID"
  type        = string
}

variable "invoices_bucket_arn" {
  description = "ARN of the invoices S3 bucket to enable CloudTrail data events on"
  type        = string
}

variable "sns_topic_arn" {
  description = "ARN of the SNS topic to send security alerts to (from the cloudwatch module)"
  type        = string
}

variable "common_tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
