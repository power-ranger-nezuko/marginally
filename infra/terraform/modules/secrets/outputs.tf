output "secret_arns" {
  description = "Map of secret name to ARN"
  value       = { for k, v in aws_secretsmanager_secret.platform : k => v.arn }
  sensitive   = true
}

output "jwt_private_key_arn" {
  value     = aws_secretsmanager_secret.platform["jwt_private_key"].arn
  sensitive = true
}

output "stripe_platform_key_arn" {
  value     = aws_secretsmanager_secret.platform["stripe_platform_key"].arn
  sensitive = true
}
