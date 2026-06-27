output "alb_dns" {
  description = "DNS name of the Application Load Balancer"
  value       = module.alb.alb_dns_name
}

output "cloudfront_domain" {
  description = "CloudFront domain for the frontend SPA"
  value       = module.cloudfront.frontend_domain
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = module.elasticache.primary_endpoint
  sensitive   = true
}

output "ecr_repository_url" {
  description = "ECR repository URL for the application image"
  value       = module.ecs.ecr_repository_url
}

output "sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alerts"
  value       = module.cloudwatch.sns_topic_arn
}

output "github_deploy_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC deployments"
  value       = module.iam.github_deploy_role_arn
}
