output "webhook_queue_url" {
  value = aws_sqs_queue.webhook.url
}

output "webhook_queue_arn" {
  value = aws_sqs_queue.webhook.arn
}

output "dlq_name" {
  value = aws_sqs_queue.webhook_dlq.name
}

output "pdf_jobs_queue_url" {
  value = aws_sqs_queue.pdf_jobs.url
}

output "pdf_jobs_queue_arn" {
  value = aws_sqs_queue.pdf_jobs.arn
}

output "pdf_jobs_queue_name" {
  value = aws_sqs_queue.pdf_jobs.name
}
