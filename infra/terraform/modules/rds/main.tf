resource "aws_db_subnet_group" "main" {
  name        = "marginly-${var.environment}-db-subnet-group"
  subnet_ids  = var.db_subnet_ids
  description = "Marginly ${var.environment} RDS subnet group (data subnets)"

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-db-subnet-group" })
}

resource "aws_db_parameter_group" "postgres16" {
  name        = "marginly-${var.environment}-pg16"
  family      = "postgres16"
  description = "Marginly PostgreSQL 16 parameter group — enforce SSL"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-pg16-params" })
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db_password" {
  name        = "/marginly/${var.environment}/db_password"
  description = "RDS master password"

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-db-password" })
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db.result
}

resource "aws_db_instance" "main" {
  identifier = "marginly-${var.environment}"

  engine               = "postgres"
  engine_version       = "16"
  instance_class       = var.db_instance_class
  allocated_storage    = 20
  max_allocated_storage = 100
  storage_type         = "gp3"
  storage_encrypted    = true

  db_name  = "marginly"
  username = "marginly_admin"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.db_sg_id]
  parameter_group_name   = aws_db_parameter_group.postgres16.name

  multi_az                = var.full_scale
  publicly_accessible     = false
  deletion_protection     = var.environment == "prod"
  backup_retention_period = var.full_scale ? 7 : 1
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "marginly-prod-final-${formatdate("YYYYMMDDHHmmss", timestamp())}" : null

  performance_insights_enabled = true
  monitoring_interval          = var.full_scale ? 60 : 0
  monitoring_role_arn          = aws_iam_role.rds_enhanced_monitoring.arn

  enabled_cloudwatch_logs_exports = var.full_scale ? ["postgresql", "upgrade"] : []

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-rds" })

  lifecycle {
    ignore_changes = [final_snapshot_identifier]
  }
}

# Enhanced monitoring role
resource "aws_iam_role" "rds_enhanced_monitoring" {
  name = "marginly-${var.environment}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "monitoring.rds.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-rds-monitoring" })
}

resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring" {
  role       = aws_iam_role.rds_enhanced_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
