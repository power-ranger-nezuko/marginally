data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}

# ── api.{domain} → ALB ───────────────────────────────────────────────────────

resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# ── {domain} + www.{domain} → CloudFront (frontend) ──────────────────────────

resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.frontend_cloudfront_domain
    zone_id                = var.frontend_cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.frontend_cloudfront_domain
    zone_id                = var.frontend_cloudfront_zone_id
    evaluate_target_health = false
  }
}

# ── invoices.{domain} → CloudFront (invoices) ────────────────────────────────

resource "aws_route53_record" "invoices" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "invoices.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.invoices_cloudfront_domain
    zone_id                = var.invoices_cloudfront_zone_id
    evaluate_target_health = false
  }
}
