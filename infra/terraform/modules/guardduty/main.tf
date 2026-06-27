# ── GuardDuty detector ────────────────────────────────────────────────────────

resource "aws_guardduty_detector" "main" {
  count                        = var.enabled ? 1 : 0
  enable                       = true
  finding_publishing_frequency = "SIX_HOURS"
  tags                         = var.common_tags

  datasources {
    s3_logs {
      enable = true
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = true
        }
      }
    }
  }
}

# ── EventBridge rule — forward medium+ findings to SNS ───────────────────────

resource "aws_cloudwatch_event_rule" "guardduty_findings" {
  count       = var.enabled ? 1 : 0
  name        = "marginly-${var.environment}-guardduty-findings"
  description = "Forward GuardDuty findings with severity >= 4 to SNS"
  tags        = var.common_tags

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
    detail = {
      severity = [{ numeric = [">=", 4] }]
    }
  })
}

resource "aws_cloudwatch_event_target" "guardduty_to_sns" {
  count     = var.enabled ? 1 : 0
  rule      = aws_cloudwatch_event_rule.guardduty_findings[0].name
  target_id = "GuardDutyToSNS"
  arn       = var.sns_topic_arn
}

# ── SNS topic policy allowing EventBridge to publish ─────────────────────────

resource "aws_sns_topic_policy" "guardduty_publish" {
  count = var.enabled ? 1 : 0
  arn   = var.sns_topic_arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowEventBridgeGuardDuty"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = var.sns_topic_arn
      }
    ]
  })
}
