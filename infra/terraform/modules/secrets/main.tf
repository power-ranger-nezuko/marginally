locals {
  secrets = {
    jwt_private_key       = "RSA private key for JWT RS256 signing"
    jwt_public_key        = "RSA public key for JWT RS256 verification"
    stripe_platform_key   = "Stripe platform secret key"
    stripe_webhook_secret = "Stripe webhook signing secret"
    shopify_api_secret    = "Shopify API secret for webhook HMAC verification"
    widget_secret         = "HMAC secret for signing cancellation-widget tokens"
  }
}

resource "aws_secretsmanager_secret" "platform" {
  for_each = local.secrets

  name        = "/marginly/${var.environment}/${each.key}"
  description = each.value

  # TODO: configure rotation Lambda for jwt_private_key and stripe_platform_key
  # rotation_rules { automatically_after_days = 90 }
  # rotation_lambda_arn = "arn:aws:lambda:..."

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-${each.key}" })
}

# Placeholder versions so the secrets exist and can be referenced
resource "aws_secretsmanager_secret_version" "platform" {
  for_each  = local.secrets
  secret_id = aws_secretsmanager_secret.platform[each.key].id

  # Placeholder value — update via AWS Console or CLI before deployment
  secret_string = jsonencode({ value = "REPLACE_ME_BEFORE_DEPLOY" })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
