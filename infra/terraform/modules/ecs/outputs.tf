output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "cluster_arn" {
  value = aws_ecs_cluster.main.arn
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "api_service_name" {
  value = aws_ecs_service.api.name
}

output "worker_service_name" {
  value = aws_ecs_service.worker.name
}

output "pdf_service_name" {
  value = aws_ecs_service.pdf.name
}

output "api_log_group_name" {
  description = "CloudWatch log group name for the API container (used by cloudwatch module metric filters)."
  value       = aws_cloudwatch_log_group.api.name
}
