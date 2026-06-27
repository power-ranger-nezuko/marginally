# ── SNS ───────────────────────────────────────────────────────────────────────

resource "aws_sns_topic" "alerts" {
  name = "marginly-${var.environment}-alerts"
  tags = var.common_tags
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}


# ── Alarm 1: ECS API CPU > 80% ────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "api_cpu_high" {
  alarm_name          = "marginly-${var.environment}-api-cpu-high"
  alarm_description   = "ECS API service CPU utilisation exceeded 80% for 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.api_service_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  tags          = var.common_tags
}

# ── Alarm 2: RDS FreeStorageSpace < 2 GB ──────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "rds_storage_low" {
  alarm_name          = "marginly-${var.environment}-rds-storage-low"
  alarm_description   = "RDS free storage space dropped below 2 GB"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 2147483648
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = var.rds_identifier
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  tags          = var.common_tags
}

# ── Alarm 3: SQS DLQ messages visible > 0 ────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "marginly-${var.environment}-dlq-messages-visible"
  alarm_description   = "Messages are accumulating in the webhook dead-letter queue"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = var.webhook_dlq_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = var.common_tags
}

# ── Alarm 4: ALB 5XX errors > 10 per 5 min ───────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "marginly-${var.environment}-alb-5xx-high"
  alarm_description   = "ALB is returning more than 10 HTTP 5XX errors in a 5-minute window"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  tags          = var.common_tags
}

# ── Alarm 5: Login failure rate > 50 per minute ──────────────────────────────

resource "aws_cloudwatch_log_metric_filter" "login_failures" {
  name           = "marginly-${var.environment}-login-failures"
  log_group_name = var.api_log_group_name
  pattern        = "{ $.statusCode = 401 && $.path = \"/api/v1/auth/login\" }"

  metric_transformation {
    name          = "LoginFailures"
    namespace     = "Marginly/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "login_failures_high" {
  alarm_name          = "marginly-${var.environment}-login-failures-high"
  alarm_description   = "More than 50 failed login attempts detected in a single minute"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "LoginFailures"
  namespace           = "Marginly/${var.environment}"
  period              = 60
  statistic           = "Sum"
  threshold           = 50
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = var.common_tags
}
