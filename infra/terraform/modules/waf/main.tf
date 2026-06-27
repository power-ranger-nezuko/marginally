terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

# ── Regex pattern sets ────────────────────────────────────────────────────────

resource "aws_wafv2_regex_pattern_set" "login_path" {
  count       = var.enabled ? 1 : 0
  name        = "marginly-${var.environment}-login-path"
  description = "Matches /api/v1/auth/login path for rate limiting"
  scope       = "REGIONAL"

  regular_expression {
    regex_string = "^/api/v1/auth/login$"
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-login-path-regex" })
}

resource "aws_wafv2_regex_pattern_set" "login_path_cf" {
  count       = var.enabled ? 1 : 0
  provider    = aws.us_east_1
  name        = "marginly-${var.environment}-login-path-cf"
  description = "Matches /api/v1/auth/login path for CloudFront rate limiting"
  scope       = "CLOUDFRONT"

  regular_expression {
    regex_string = "^/api/v1/auth/login$"
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-login-path-regex-cf" })
}

# ── REGIONAL WAF (for ALB) ────────────────────────────────────────────────────

resource "aws_wafv2_web_acl" "regional" {
  count       = var.enabled ? 1 : 0
  name        = "marginly-${var.environment}-regional-waf"
  description = "Marginly ${var.environment} WAF for ALB"
  scope       = "REGIONAL"

  default_action { allow {} }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 10
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "marginly-${var.environment}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 20
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "marginly-${var.environment}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 30
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "marginly-${var.environment}-sqli"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimitPerIP"
    priority = 40
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "marginly-${var.environment}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimitLoginEndpoint"
    priority = 50
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 20
        aggregate_key_type = "IP"
        scope_down_statement {
          regex_pattern_set_reference_statement {
            arn = aws_wafv2_regex_pattern_set.login_path[0].arn
            field_to_match { uri_path {} }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "marginly-${var.environment}-login-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "marginly-${var.environment}-regional-waf"
    sampled_requests_enabled   = true
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-regional-waf" })
}

# ── CLOUDFRONT WAF (must be us-east-1) ───────────────────────────────────────

resource "aws_wafv2_web_acl" "cloudfront" {
  count       = var.enabled ? 1 : 0
  provider    = aws.us_east_1
  name        = "marginly-${var.environment}-cloudfront-waf"
  description = "Marginly ${var.environment} WAF for CloudFront"
  scope       = "CLOUDFRONT"

  default_action { allow {} }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 10
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "marginly-${var.environment}-cf-common-rules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 20
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "marginly-${var.environment}-cf-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 30
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "marginly-${var.environment}-cf-sqli"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimitPerIP"
    priority = 40
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "marginly-${var.environment}-cf-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimitLoginEndpoint"
    priority = 50
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 20
        aggregate_key_type = "IP"
        scope_down_statement {
          regex_pattern_set_reference_statement {
            arn = aws_wafv2_regex_pattern_set.login_path_cf[0].arn
            field_to_match { uri_path {} }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "marginly-${var.environment}-cf-login-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "marginly-${var.environment}-cloudfront-waf"
    sampled_requests_enabled   = true
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-cloudfront-waf" })
}
