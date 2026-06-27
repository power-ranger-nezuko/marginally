terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "s3" {
    bucket         = "marginly-tf-state-094155361146"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "marginly-tf-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

# us-east-1 provider alias required for CloudFront WAF and ACM
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.common_tags
  }
}

data "aws_caller_identity" "current" {}

locals {
  common_tags = {
    Project     = "marginly"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ── Flag validation ────────────────────────────────────────────────────────────
# lean_scale and full_scale are mutually exclusive. Terraform 1.9+ allows
# cross-variable validation; for 1.6–1.8 we use terraform_data precondition.
resource "terraform_data" "validate_scale_flags" {
  lifecycle {
    precondition {
      condition     = !(var.lean_scale && var.full_scale)
      error_message = "lean_scale and full_scale are mutually exclusive — set exactly one to true."
    }
  }
}

# ── VPC ──────────────────────────────────────────────────────────────────────
module "vpc" {
  source      = "./modules/vpc"
  environment = var.environment
  vpc_cidr    = var.vpc_cidr
  full_scale  = var.full_scale
  common_tags = local.common_tags
}

# ── KMS ──────────────────────────────────────────────────────────────────────
module "kms" {
  source          = "./modules/kms"
  environment     = var.environment
  account_id      = data.aws_caller_identity.current.account_id
  api_role_arn    = module.iam.api_task_role_arn
  worker_role_arn = module.iam.worker_task_role_arn
  common_tags     = local.common_tags
}

# ── Secrets Manager ───────────────────────────────────────────────────────────
module "secrets" {
  source      = "./modules/secrets"
  environment = var.environment
  common_tags = local.common_tags
}

# ── RDS ──────────────────────────────────────────────────────────────────────
module "rds" {
  source            = "./modules/rds"
  environment       = var.environment
  db_instance_class = var.db_instance_class
  db_subnet_ids     = module.vpc.data_subnet_ids
  db_sg_id          = module.vpc.db_sg_id
  full_scale        = var.full_scale
  common_tags       = local.common_tags
}

# ── ElastiCache ───────────────────────────────────────────────────────────────
module "elasticache" {
  source      = "./modules/elasticache"
  environment = var.environment
  subnet_ids  = module.vpc.data_subnet_ids
  redis_sg_id = module.vpc.redis_sg_id
  full_scale  = var.full_scale
  common_tags = local.common_tags
}

# ── S3 ───────────────────────────────────────────────────────────────────────
module "s3" {
  source      = "./modules/s3"
  environment = var.environment
  common_tags = local.common_tags
}

# ── IAM ──────────────────────────────────────────────────────────────────────
module "iam" {
  source              = "./modules/iam"
  environment         = var.environment
  account_id          = data.aws_caller_identity.current.account_id
  kms_key_arn         = module.kms.key_arn
  invoices_bucket_arn = module.s3.invoices_bucket_arn
  webhook_queue_arn   = module.sqs.webhook_queue_arn
  secrets_prefix_arn  = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:/marginly/${var.environment}/*"

  aws_region          = var.aws_region
  common_tags         = local.common_tags
}

# ── SQS ──────────────────────────────────────────────────────────────────────
module "sqs" {
  source        = "./modules/sqs"
  environment   = var.environment
  sns_topic_arn = module.cloudwatch.sns_topic_arn
  common_tags   = local.common_tags
}

# ── ACM ──────────────────────────────────────────────────────────────────────
module "acm" {
  source      = "./modules/acm"
  domain_name = var.domain_name
  zone_id     = module.route53.zone_id
  common_tags = local.common_tags

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }
}

# ── WAF ──────────────────────────────────────────────────────────────────────
# Enabled only under advanced_security. When disabled, outputs return null
# and the ALB/CloudFront WAF associations are skipped.
module "waf" {
  source      = "./modules/waf"
  environment = var.environment
  enabled     = var.advanced_security
  common_tags = local.common_tags

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }
}

# ── ALB ──────────────────────────────────────────────────────────────────────
module "alb" {
  source            = "./modules/alb"
  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  alb_sg_id         = module.vpc.alb_sg_id
  certificate_arn   = module.acm.certificate_arn
  waf_acl_arn       = module.waf.regional_acl_arn
  full_scale        = var.full_scale
  common_tags       = local.common_tags
}

# ── CloudFront ────────────────────────────────────────────────────────────────
module "cloudfront" {
  source                 = "./modules/cloudfront"
  environment            = var.environment
  frontend_bucket_id     = module.s3.frontend_bucket_id
  frontend_bucket_domain = module.s3.frontend_bucket_domain
  invoices_bucket_id     = module.s3.invoices_bucket_id
  invoices_bucket_domain = module.s3.invoices_bucket_domain
  waf_acl_arn            = module.waf.cloudfront_acl_arn
  certificate_arn        = module.acm.certificate_arn
  domain_name            = var.domain_name
  common_tags            = local.common_tags

  providers = {
    aws = aws.us_east_1
  }
}

# ── ECS ──────────────────────────────────────────────────────────────────────
# task_subnet_ids: private app subnets in full_scale, public subnets in lean_scale.
# assign_public_ip: true in lean_scale (tasks need public IP to reach internet
# without NAT), false in full_scale (NAT gateways provide internet access).
# routing_dependency_ids: ensures NAT route tables are configured before ECS
# rolling-deploys tasks into private subnets — guarantees zero-downtime on
# lean → full transition.
module "ecs" {
  source                   = "./modules/ecs"
  environment              = var.environment
  aws_region               = var.aws_region
  account_id               = data.aws_caller_identity.current.account_id
  app_image_tag            = var.app_image_tag
  vpc_id                   = module.vpc.vpc_id
  task_subnet_ids          = var.full_scale ? module.vpc.app_subnet_ids : module.vpc.public_subnet_ids
  assign_public_ip         = !var.full_scale
  routing_dependency_ids   = module.vpc.app_route_table_association_ids
  full_scale               = var.full_scale
  app_sg_id                = module.vpc.app_sg_id
  alb_target_group_arn     = module.alb.target_group_arn
  api_task_role_arn        = module.iam.api_task_role_arn
  worker_task_role_arn     = module.iam.worker_task_role_arn
  pdf_task_role_arn        = module.iam.pdf_task_role_arn
  execution_role_arn       = module.iam.execution_role_arn
  secrets                  = module.secrets.secret_arns
  webhook_queue_url        = module.sqs.webhook_queue_url
  alb_arn_suffix           = module.alb.alb_arn_suffix
  target_group_arn_suffix  = module.alb.target_group_arn_suffix
  domain_name              = var.domain_name
  common_tags              = local.common_tags

  depends_on = [module.alb]
}

# ── Route53 ──────────────────────────────────────────────────────────────────
module "route53" {
  source                      = "./modules/route53"
  domain_name                 = var.domain_name
  alb_dns_name                = module.alb.alb_dns_name
  alb_zone_id                 = module.alb.alb_zone_id
  frontend_cloudfront_domain  = module.cloudfront.frontend_domain
  frontend_cloudfront_zone_id = module.cloudfront.frontend_zone_id
  invoices_cloudfront_domain  = module.cloudfront.invoices_domain
  invoices_cloudfront_zone_id = module.cloudfront.invoices_zone_id
  common_tags                 = local.common_tags
}

# ── CloudWatch ────────────────────────────────────────────────────────────────
module "cloudwatch" {
  source                  = "./modules/cloudwatch"
  environment             = var.environment
  alert_email             = var.alert_email
  alb_arn_suffix          = module.alb.alb_arn_suffix
  target_group_arn_suffix = module.alb.target_group_arn_suffix
  rds_identifier          = module.rds.db_identifier
  webhook_dlq_name        = module.sqs.dlq_name
  ecs_cluster_name        = module.ecs.cluster_name
  api_log_group_name      = module.ecs.api_log_group_name
  api_service_name        = module.ecs.api_service_name
  common_tags             = local.common_tags
}

# ── CloudTrail ────────────────────────────────────────────────────────────────
# Enabled only under advanced_security.
module "cloudtrail" {
  source              = "./modules/cloudtrail"
  environment         = var.environment
  account_id          = data.aws_caller_identity.current.account_id
  invoices_bucket_arn = module.s3.invoices_bucket_arn
  sns_topic_arn       = module.cloudwatch.sns_topic_arn
  enabled             = var.advanced_security
  common_tags         = local.common_tags
}

# ── GuardDuty ─────────────────────────────────────────────────────────────────
# Enabled only under advanced_security.
module "guardduty" {
  source        = "./modules/guardduty"
  environment   = var.environment
  sns_topic_arn = module.cloudwatch.sns_topic_arn
  enabled       = var.advanced_security
  common_tags   = local.common_tags
}
