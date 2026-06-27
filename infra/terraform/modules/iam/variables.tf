variable "environment" {
  type = string
}

variable "account_id" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "kms_key_arn" {
  type = string
}

variable "invoices_bucket_arn" {
  type = string
}

variable "webhook_queue_arn" {
  type = string
}

variable "secrets_prefix_arn" {
  type = string
}

variable "postmark_secret_arn" {
  type = string
}

variable "common_tags" {
  type = map(string)
}
