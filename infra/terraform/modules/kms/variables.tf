variable "environment" {
  type = string
}

variable "account_id" {
  type = string
}

variable "api_role_arn" {
  type = string
}

variable "worker_role_arn" {
  type = string
}

variable "common_tags" {
  type = map(string)
}
