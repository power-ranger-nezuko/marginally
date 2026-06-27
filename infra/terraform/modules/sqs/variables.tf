variable "environment" {
  type = string
}

variable "sns_topic_arn" {
  type = string
}

variable "common_tags" {
  type = map(string)
}
