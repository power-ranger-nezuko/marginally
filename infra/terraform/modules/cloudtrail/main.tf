# random_id is always kept in state so the bucket name is stable across
# enable/disable cycles (no orphaned buckets from name changes).
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# ── CloudTrail log bucket ─────────────────────────────────────────────────────

resource "aws_s3_bucket" "cloudtrail_logs" {
  count         = var.enabled ? 1 : 0
  bucket        = "marginly-${var.environment}-cloudtrail-${random_id.bucket_suffix.hex}"
  force_destroy = false
  tags          = var.common_tags
}

resource "aws_s3_bucket_versioning" "cloudtrail_logs" {
  count  = var.enabled ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail_logs[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail_logs" {
  count  = var.enabled ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail_logs[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail_logs" {
  count                   = var.enabled ? 1 : 0
  bucket                  = aws_s3_bucket.cloudtrail_logs[0].id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail_logs" {
  count  = var.enabled ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail_logs[0].id

  rule {
    id     = "archive-and-expire"
    status = "Enabled"

    filter {}

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail_logs" {
  count  = var.enabled ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail_logs[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail_logs[0].arn
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail_logs[0].arn}/AWSLogs/${var.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      }
    ]
  })
}

# ── CloudWatch Logs for CloudTrail ────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "cloudtrail" {
  count             = var.enabled ? 1 : 0
  name              = "/aws/cloudtrail/marginly-${var.environment}"
  retention_in_days = 90
  tags              = var.common_tags
}

# ── IAM role for CloudTrail → CloudWatch Logs ─────────────────────────────────

resource "aws_iam_role" "cloudtrail_cw" {
  count = var.enabled ? 1 : 0
  name  = "marginly-${var.environment}-cloudtrail-cw"
  tags  = var.common_tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "cloudtrail_cw" {
  count = var.enabled ? 1 : 0
  name  = "cloudtrail-to-cloudwatch-logs"
  role  = aws_iam_role.cloudtrail_cw[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.cloudtrail[0].arn}:*"
      }
    ]
  })
}

# ── CloudTrail ────────────────────────────────────────────────────────────────

resource "aws_cloudtrail" "main" {
  count                         = var.enabled ? 1 : 0
  name                          = "marginly-${var.environment}"
  s3_bucket_name                = aws_s3_bucket.cloudtrail_logs[0].id
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  include_global_service_events = true
  cloud_watch_logs_group_arn    = "${aws_cloudwatch_log_group.cloudtrail[0].arn}:*"
  cloud_watch_logs_role_arn     = aws_iam_role.cloudtrail_cw[0].arn
  tags                          = var.common_tags

  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::S3::Object"
      values = ["${var.invoices_bucket_arn}/"]
    }
  }

  depends_on = [aws_s3_bucket_policy.cloudtrail_logs]
}

# ── Root login metric filter & alarm ─────────────────────────────────────────

resource "aws_cloudwatch_log_metric_filter" "root_login" {
  count          = var.enabled ? 1 : 0
  name           = "marginly-${var.environment}-root-login"
  log_group_name = aws_cloudwatch_log_group.cloudtrail[0].name
  pattern        = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"

  metric_transformation {
    name          = "RootAccountLoginCount"
    namespace     = "Marginly/Security"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "root_login_alert" {
  count               = var.enabled ? 1 : 0
  alarm_name          = "marginly-${var.environment}-root-login"
  alarm_description   = "Root account login detected — immediate investigation required"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "RootAccountLoginCount"
  namespace           = "Marginly/Security"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  alarm_actions = [var.sns_topic_arn]
  tags          = var.common_tags
}
