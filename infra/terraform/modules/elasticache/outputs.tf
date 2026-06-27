output "primary_endpoint" {
  value     = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive = true
}

output "auth_token" {
  value     = random_password.redis_auth.result
  sensitive = true
}

output "auth_secret_arn" {
  value     = aws_secretsmanager_secret.redis_auth.arn
  sensitive = true
}
