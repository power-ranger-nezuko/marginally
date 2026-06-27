variable "environment" {
  type = string
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_subnet_ids" {
  type = list(string)
}

variable "db_sg_id" {
  type = string
}

variable "full_scale" {
  description = "Enable Multi-AZ RDS for high availability. In lean_scale this is false (single-AZ)."
  type        = bool
  default     = false
}

variable "common_tags" {
  type = map(string)
}
