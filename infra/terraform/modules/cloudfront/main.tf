terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

# ── Origin Access Identities ──────────────────────────────────────────────────
resource "aws_cloudfront_origin_access_identity" "frontend" {
  comment = "OAI for marginly-${var.environment} frontend S3 bucket"
}

resource "aws_cloudfront_origin_access_identity" "invoices" {
  comment = "OAI for marginly-${var.environment} invoices S3 bucket"
}

# Grant OAI read access to frontend bucket
resource "aws_s3_bucket_policy" "frontend" {
  bucket = var.frontend_bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowCloudFrontOAI"
      Effect = "Allow"
      Principal = {
        AWS = aws_cloudfront_origin_access_identity.frontend.iam_arn
      }
      Action   = ["s3:GetObject"]
      Resource = "arn:aws:s3:::${var.frontend_bucket_id}/*"
    }]
  })
}

# Grant OAI read access to invoices bucket
resource "aws_s3_bucket_policy" "invoices" {
  bucket = var.invoices_bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowCloudFrontOAI"
      Effect = "Allow"
      Principal = {
        AWS = aws_cloudfront_origin_access_identity.invoices.iam_arn
      }
      Action   = ["s3:GetObject"]
      Resource = "arn:aws:s3:::${var.invoices_bucket_id}/*"
    }]
  })
}

# ── CloudFront Key Group (for signed URLs on invoices) ───────────────────────
resource "aws_cloudfront_public_key" "invoices" {
  name        = "marginly-${var.environment}-invoices-signing-key"
  comment     = "Public key for signing invoice CloudFront URLs"
  encoded_key = var.cloudfront_public_key_pem != "" ? var.cloudfront_public_key_pem : file("${path.module}/placeholder-public-key.pem")

  lifecycle {
    ignore_changes = [encoded_key]
  }
}

resource "aws_cloudfront_key_group" "invoices" {
  name    = "marginly-${var.environment}-invoices-key-group"
  comment = "Key group for invoice signed URLs"
  items   = [aws_cloudfront_public_key.invoices.id]
}

# ── Frontend Distribution ─────────────────────────────────────────────────────
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Marginly ${var.environment} frontend SPA"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  web_acl_id          = var.waf_acl_arn

  aliases = [var.domain_name, "www.${var.domain_name}"]

  origin {
    domain_name = var.frontend_bucket_domain
    origin_id   = "S3-frontend"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.frontend.cloudfront_access_identity_path
    }
  }

  origin {
    domain_name = "api.${var.domain_name}"
    origin_id   = "ALB-api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Proxy /api/v1/* to the ALB — no caching, forward everything
  ordered_cache_behavior {
    path_pattern           = "/api/v1/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "ALB-api"
    viewer_protocol_policy = "https-only"
    compress               = false
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0

    forwarded_values {
      query_string = true
      headers      = ["*"]
      cookies {
        forward = "all"
      }
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-frontend"
    compress         = true

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # SPA routing: 403/404 → index.html with 200
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-frontend-cf" })
}

# ── Invoices Distribution ─────────────────────────────────────────────────────
resource "aws_cloudfront_distribution" "invoices" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Marginly ${var.environment} invoices (signed URLs)"
  price_class     = "PriceClass_100"
  web_acl_id      = var.waf_acl_arn

  aliases = ["invoices.${var.domain_name}"]

  origin {
    domain_name = var.invoices_bucket_domain
    origin_id   = "S3-invoices"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.invoices.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-invoices"
    compress         = true

    viewer_protocol_policy = "https-only"
    min_ttl                = 0
    default_ttl            = 900  # 15 minutes (matches signed URL TTL)
    max_ttl                = 900

    trusted_key_groups = [aws_cloudfront_key_group.invoices.id]

    forwarded_values {
      query_string = true
      cookies {
        forward = "none"
      }
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-invoices-cf" })
}
