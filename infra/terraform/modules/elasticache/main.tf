resource "aws_elasticache_subnet_group" "main" {
  name        = "marginly-${var.environment}-redis-subnet-group"
  subnet_ids  = var.subnet_ids
  description = "Marginly ${var.environment} ElastiCache subnet group"

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-redis-subnet-group" })
}

resource "random_password" "redis_auth" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "redis_auth" {
  name        = "/marginly/${var.environment}/redis_auth_token"
  description = "ElastiCache Redis AUTH token"

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-redis-auth" })
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id     = aws_secretsmanager_secret.redis_auth.id
  secret_string = random_password.redis_auth.result
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "marginly-${var.environment}-redis"
  description                = "Marginly ${var.environment} Redis cluster"

  node_type            = "cache.t4g.micro"
  num_cache_clusters   = var.full_scale ? 2 : 1
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.redis7.name
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [var.redis_sg_id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result
  auth_token_update_strategy = "ROTATE"

  engine_version       = "7.1"
  automatic_failover_enabled = var.full_scale
  multi_az_enabled           = var.full_scale

  snapshot_retention_limit = 3
  snapshot_window          = "05:00-06:00"
  maintenance_window       = "Mon:06:00-Mon:07:00"

  apply_immediately = var.environment != "prod"

  log_delivery_configuration {
    destination      = "/marginly/${var.environment}/redis/slow-logs"
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-redis" })
}

resource "aws_elasticache_parameter_group" "redis7" {
  name   = "marginly-${var.environment}-redis7"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-redis7-params" })
}
