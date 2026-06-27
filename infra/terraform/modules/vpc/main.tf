data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_region" "current" {}

# ── VPC ──────────────────────────────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-vpc" })
}

# ── Public subnets (always present — ALB lives here; ECS tasks in lean_scale) ─
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = ["10.0.1.0/24", "10.0.2.0/24"][count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = false

  tags = merge(var.common_tags, {
    Name = "marginly-${var.environment}-public-${count.index + 1}"
    Tier = "public"
  })
}

# ── Private app subnets (full_scale only — ECS tasks run here behind NAT) ────
resource "aws_subnet" "private_app" {
  count             = var.full_scale ? 2 : 0
  vpc_id            = aws_vpc.main.id
  cidr_block        = ["10.0.3.0/24", "10.0.4.0/24"][count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(var.common_tags, {
    Name = "marginly-${var.environment}-app-${count.index + 1}"
    Tier = "private-app"
  })
}

# ── Private data subnets (always present — RDS and ElastiCache live here) ────
resource "aws_subnet" "private_data" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = ["10.0.5.0/24", "10.0.6.0/24"][count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(var.common_tags, {
    Name = "marginly-${var.environment}-data-${count.index + 1}"
    Tier = "private-data"
  })
}

# ── Internet Gateway ──────────────────────────────────────────────────────────
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-igw" })
}

# ── Elastic IPs for NAT Gateways (full_scale only) ───────────────────────────
resource "aws_eip" "nat" {
  count  = var.full_scale ? 2 : 0
  domain = "vpc"

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-nat-eip-${count.index + 1}" })

  depends_on = [aws_internet_gateway.main]
}

# ── NAT Gateways — one per AZ (full_scale only) ──────────────────────────────
# In lean_scale, ECS tasks run in public subnets with a public IP and reach
# the internet directly via the Internet Gateway. No NAT is needed or billed.
resource "aws_nat_gateway" "main" {
  count         = var.full_scale ? 2 : 0
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-nat-${count.index + 1}" })

  depends_on = [aws_internet_gateway.main]
}

# ── Route Tables ─────────────────────────────────────────────────────────────

# Public route table — default route via Internet Gateway
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-public-rt" })
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private app route tables — default route via NAT (full_scale only)
resource "aws_route_table" "private_app" {
  count  = var.full_scale ? 2 : 0
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-app-rt-${count.index + 1}" })
}

resource "aws_route_table_association" "private_app" {
  count          = var.full_scale ? 2 : 0
  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private_app[count.index].id
}

# Private data route table — no default route (RDS/Redis need no internet)
resource "aws_route_table" "private_data" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-data-rt" })
}

resource "aws_route_table_association" "private_data" {
  count          = 2
  subnet_id      = aws_subnet.private_data[count.index].id
  route_table_id = aws_route_table.private_data.id
}

# ── VPC Endpoints ─────────────────────────────────────────────────────────────
# S3 Gateway endpoint — always free, benefits all subnets.
#
# Interface endpoints (Secrets Manager, KMS, SQS) — full_scale only.
# In lean_scale, ECS tasks have public IPs and reach these services via the
# Internet Gateway at no cost, so interface endpoints are unnecessary.
# In full_scale, tasks sit in private subnets with no internet route, so
# interface endpoints are the only path to these AWS APIs without NAT traffic.

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids = concat(
    [aws_route_table.private_data.id],
    aws_route_table.private_app[*].id,
    [aws_route_table.public.id],
  )

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-s3-endpoint" })
}

resource "aws_security_group" "vpc_endpoints" {
  count       = var.full_scale ? 1 : 0
  name        = "marginly-${var.environment}-vpc-endpoints-sg"
  description = "Security group for VPC interface endpoints (full_scale only)"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from private app subnets"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = aws_subnet.private_app[*].cidr_block
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-vpc-endpoints-sg" })
}

resource "aws_vpc_endpoint" "secretsmanager" {
  count               = var.full_scale ? 1 : 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private_app[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints[0].id]
  private_dns_enabled = true

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-secretsmanager-endpoint" })
}

resource "aws_vpc_endpoint" "kms" {
  count               = var.full_scale ? 1 : 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.kms"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private_app[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints[0].id]
  private_dns_enabled = true

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-kms-endpoint" })
}

resource "aws_vpc_endpoint" "sqs" {
  count               = var.full_scale ? 1 : 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.sqs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private_app[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints[0].id]
  private_dns_enabled = true

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-sqs-endpoint" })
}

# ── Security Groups ───────────────────────────────────────────────────────────

# Security groups are created bare (no cross-SG inline rules) to avoid
# circular dependencies. Cross-SG rules are added as separate resources below.

resource "aws_security_group" "alb" {
  name        = "marginly-${var.environment}-alb-sg"
  description = "ALB: HTTPS/HTTP inbound, outbound to app"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS inbound"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP inbound (redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-alb-sg" })
}

resource "aws_security_group" "app" {
  name        = "marginly-${var.environment}-app-sg"
  description = "ECS app tasks: inbound from ALB, outbound to DB/Redis/internet"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "HTTPS to internet (external APIs; via NAT in full_scale, direct in lean_scale)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-app-sg" })
}

resource "aws_security_group" "db" {
  name        = "marginly-${var.environment}-db-sg"
  description = "RDS: inbound from app-sg only, no outbound"
  vpc_id      = aws_vpc.main.id

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-db-sg" })
}

resource "aws_security_group" "redis" {
  name        = "marginly-${var.environment}-redis-sg"
  description = "ElastiCache: inbound from app-sg only, no outbound"
  vpc_id      = aws_vpc.main.id

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-redis-sg" })
}

# ── Cross-SG rules (added separately to break circular dependencies) ──────────

resource "aws_security_group_rule" "alb_egress_app" {
  type                     = "egress"
  from_port                = 4000
  to_port                  = 4000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.alb.id
  source_security_group_id = aws_security_group.app.id
  description              = "App port to app-sg"
}

resource "aws_security_group_rule" "app_ingress_alb" {
  type                     = "ingress"
  from_port                = 4000
  to_port                  = 4000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.app.id
  source_security_group_id = aws_security_group.alb.id
  description              = "App port from ALB"
}

resource "aws_security_group_rule" "app_egress_db" {
  type                     = "egress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.app.id
  source_security_group_id = aws_security_group.db.id
  description              = "PostgreSQL to db-sg"
}

resource "aws_security_group_rule" "db_ingress_app" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.db.id
  source_security_group_id = aws_security_group.app.id
  description              = "PostgreSQL from app-sg"
}

resource "aws_security_group_rule" "app_egress_redis" {
  type                     = "egress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = aws_security_group.app.id
  source_security_group_id = aws_security_group.redis.id
  description              = "Redis to redis-sg"
}

resource "aws_security_group_rule" "redis_ingress_app" {
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = aws_security_group.redis.id
  source_security_group_id = aws_security_group.app.id
  description              = "Redis from app-sg"
}
