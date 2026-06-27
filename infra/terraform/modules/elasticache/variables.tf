variable "environment" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "redis_sg_id" {
  type = string
}

variable "full_scale" {
  description = "Enable 2-node Multi-AZ Redis replication group. In lean_scale a single node is used."
  type        = bool
  default     = false
}

variable "common_tags" {
  type = map(string)
}
