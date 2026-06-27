# ── Dead-Letter Queue ─────────────────────────────────────────────────────────
resource "aws_sqs_queue" "webhook_dlq" {
  name                       = "marginly-${var.environment}-webhook-dlq"
  message_retention_seconds  = 1209600 # 14 days
  kms_master_key_id          = "alias/aws/sqs"

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-webhook-dlq" })
}

# ── Main Webhook Queue ────────────────────────────────────────────────────────
resource "aws_sqs_queue" "webhook" {
  name                       = "marginly-${var.environment}-webhook-queue"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 345600 # 4 days
  kms_master_key_id          = "alias/aws/sqs"

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.webhook_dlq.arn
    maxReceiveCount     = 3
  })

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-webhook-queue" })
}

# ── PDF Jobs Queue ────────────────────────────────────────────────────────────
resource "aws_sqs_queue" "pdf_jobs_dlq" {
  name                      = "marginly-${var.environment}-pdf-jobs-dlq"
  message_retention_seconds = 1209600 # 14 days
  kms_master_key_id         = "alias/aws/sqs"

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-pdf-jobs-dlq" })
}

resource "aws_sqs_queue" "pdf_jobs" {
  name                       = "marginly-${var.environment}-pdf-jobs"
  visibility_timeout_seconds = 120
  message_retention_seconds  = 86400 # 1 day
  kms_master_key_id          = "alias/aws/sqs"

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.pdf_jobs_dlq.arn
    maxReceiveCount     = 3
  })

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-pdf-jobs" })
}

# ── CloudWatch Alarm: DLQ messages > 0 ───────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "webhook_dlq" {
  alarm_name          = "marginly-${var.environment}-webhook-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Webhook DLQ has messages — worker processing failures"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.webhook_dlq.name
  }

  alarm_actions = [var.sns_topic_arn]
  ok_actions    = [var.sns_topic_arn]

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-webhook-dlq-alarm" })
}
