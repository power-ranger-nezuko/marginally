resource "aws_lb" "main" {
  name               = "marginly-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_sg_id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.environment == "prod"

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "alb"
    enabled = var.full_scale
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-alb" })
}

# S3 bucket for ALB access logs
resource "aws_s3_bucket" "alb_logs" {
  bucket = "marginly-${var.environment}-alb-logs"

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-alb-logs" })
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket                  = aws_s3_bucket.alb_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    id     = "expire-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = 30
    }
  }
}

data "aws_elb_service_account" "main" {}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        AWS = data.aws_elb_service_account.main.arn
      }
      Action   = "s3:PutObject"
      Resource = "${aws_s3_bucket.alb_logs.arn}/alb/AWSLogs/*"
    }]
  })
}

# ── Target Group ─────────────────────────────────────────────────────────────
resource "aws_lb_target_group" "api" {
  name        = "marginly-${var.environment}-api-tg"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/v1/health"
    protocol            = "HTTP"
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-api-tg" })
}

# ── HTTPS Listener ────────────────────────────────────────────────────────────
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-https-listener" })
}

# ── HTTP Redirect Listener ────────────────────────────────────────────────────
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-http-redirect" })
}

# ── WAF Association (advanced_security only) ──────────────────────────────────
resource "aws_wafv2_web_acl_association" "alb" {
  count        = var.waf_acl_arn != null ? 1 : 0
  resource_arn = aws_lb.main.arn
  web_acl_arn  = var.waf_acl_arn
}
