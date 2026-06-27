# ── ECS Cluster ───────────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "marginly-${var.environment}"

  setting {
    name  = "containerInsights"
    value = var.full_scale ? "enabled" : "disabled"
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-cluster" })
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# ── ECR Repository ────────────────────────────────────────────────────────────
resource "aws_ecr_repository" "api" {
  name                 = "marginly-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(var.common_tags, { Name = "marginly-api-ecr" })
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = {
        type = "expire"
      }
    }]
  })
}

locals {
  image_uri = "${aws_ecr_repository.api.repository_url}:${var.app_image_tag}"

  # Map secrets to container secret references
  secret_refs = [
    { name = "JWT_PRIVATE_KEY",       valueFrom = var.secrets["jwt_private_key"] },
    { name = "JWT_PUBLIC_KEY",        valueFrom = var.secrets["jwt_public_key"] },
    { name = "STRIPE_PLATFORM_KEY",   valueFrom = var.secrets["stripe_platform_key"] },
    { name = "STRIPE_WEBHOOK_SECRET", valueFrom = var.secrets["stripe_webhook_secret"] },
    { name = "POSTMARK_KEY",          valueFrom = var.secrets["postmark_key"] },
    { name = "TWILIO_ACCOUNT_SID",    valueFrom = var.secrets["twilio_account_sid"] },
    { name = "TWILIO_AUTH_TOKEN",     valueFrom = var.secrets["twilio_auth_token"] },
    { name = "SHOPIFY_API_SECRET",    valueFrom = var.secrets["shopify_api_secret"] },
    { name = "WIDGET_SECRET",         valueFrom = var.secrets["widget_secret"] },
  ]
}

# ── CloudWatch Log Groups ─────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "api" {
  name              = "/marginly/${var.environment}/ecs/api"
  retention_in_days = 30

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-api-logs" })
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/marginly/${var.environment}/ecs/worker"
  retention_in_days = 30

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-worker-logs" })
}

resource "aws_cloudwatch_log_group" "pdf" {
  name              = "/marginly/${var.environment}/ecs/pdf"
  retention_in_days = 30

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-pdf-logs" })
}

# ── API Task Definition ───────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "api" {
  family                   = "marginly-${var.environment}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  task_role_arn            = var.api_task_role_arn
  execution_role_arn       = var.execution_role_arn

  container_definitions = jsonencode([{
    name      = "api"
    image     = local.image_uri
    essential = true

    portMappings = [{
      containerPort = 4000
      hostPort      = 4000
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV",         value = var.environment },
      { name = "PORT",             value = "4000" },
      { name = "SQS_WEBHOOK_URL",  value = var.webhook_queue_url },
      { name = "AWS_REGION",       value = var.aws_region },
    ]

    secrets = local.secret_refs

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:4000/api/v1/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-api-taskdef" })
}

# ── Worker Task Definition ────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "worker" {
  family                   = "marginly-${var.environment}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  task_role_arn            = var.worker_task_role_arn
  execution_role_arn       = var.execution_role_arn

  container_definitions = jsonencode([{
    name      = "worker"
    image     = local.image_uri
    essential = true
    command   = ["node", "dist/worker/main.js"]

    environment = [
      { name = "NODE_ENV",         value = var.environment },
      { name = "SQS_WEBHOOK_URL",  value = var.webhook_queue_url },
      { name = "AWS_REGION",       value = var.aws_region },
    ]

    secrets = local.secret_refs

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "worker"
      }
    }
  }])

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-worker-taskdef" })
}

# ── PDF Task Definition ───────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "pdf" {
  family                   = "marginly-${var.environment}-pdf"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  task_role_arn            = var.pdf_task_role_arn
  execution_role_arn       = var.execution_role_arn

  container_definitions = jsonencode([{
    name      = "pdf"
    image     = local.image_uri
    essential = true
    command   = ["node", "dist/pdf/main.js"]

    environment = [
      { name = "NODE_ENV",    value = var.environment },
      { name = "AWS_REGION",  value = var.aws_region },
    ]

    secrets = [
      { name = "POSTMARK_KEY", valueFrom = var.secrets["postmark_key"] }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.pdf.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "pdf"
      }
    }
  }])

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-pdf-taskdef" })
}

# ── ECS Services ──────────────────────────────────────────────────────────────
# When switching lean → full, Terraform creates NAT gateways and private
# subnets, then waits here before rolling ECS tasks into those subnets.
# This ensures the NAT route is active before any task tries to pull an image.
resource "terraform_data" "routing_ready" {
  input = var.routing_dependency_ids
}

resource "aws_ecs_service" "api" {
  name                              = "marginly-${var.environment}-api"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.api.arn
  desired_count                     = 1
  health_check_grace_period_seconds = 60
  enable_execute_command            = true

  # 1 on-demand task always running; Spot handles all scale-out (80% cheaper)
  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 4
    base              = 0
  }

  network_configuration {
    subnets          = var.task_subnet_ids
    security_groups  = [var.app_sg_id]
    assign_public_ip = var.assign_public_ip
  }

  depends_on = [terraform_data.routing_ready]

  load_balancer {
    target_group_arn = var.alb_target_group_arn
    container_name   = "api"
    container_port   = 4000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-api-service" })

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

resource "aws_ecs_service" "worker" {
  name                   = "marginly-${var.environment}-worker"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.worker.arn
  desired_count          = 1
  enable_execute_command = true

  # SQS messages re-queue on Spot interruption — safe to run 100% Spot
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
    base              = 0
  }

  network_configuration {
    subnets          = var.task_subnet_ids
    security_groups  = [var.app_sg_id]
    assign_public_ip = var.assign_public_ip
  }

  depends_on = [terraform_data.routing_ready]

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-worker-service" })

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

resource "aws_ecs_service" "pdf" {
  name                   = "marginly-${var.environment}-pdf"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.pdf.arn
  desired_count          = 0
  enable_execute_command = true

  # PDF jobs are queue-driven; Spot interruption just re-queues the job
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
    base              = 0
  }

  network_configuration {
    subnets          = var.task_subnet_ids
    security_groups  = [var.app_sg_id]
    assign_public_ip = var.assign_public_ip
  }

  depends_on = [terraform_data.routing_ready]

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-pdf-service" })

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

# ── Auto Scaling ──────────────────────────────────────────────────────────────
resource "aws_appautoscaling_target" "api" {
  max_capacity       = 10
  min_capacity       = 1
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_request_count" {
  name               = "marginly-${var.environment}-api-request-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 1000
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${var.alb_arn_suffix}/${var.target_group_arn_suffix}"
    }
  }
}

resource "aws_appautoscaling_target" "worker" {
  max_capacity       = 5
  min_capacity       = 0
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "worker_sqs_depth" {
  name               = "marginly-${var.environment}-worker-sqs-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension
  service_namespace  = aws_appautoscaling_target.worker.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 10
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    customized_metric_specification {
      metric_name = "ApproximateNumberOfMessagesVisible"
      namespace   = "AWS/SQS"
      statistic   = "Average"
      unit        = "Count"

      dimensions {
        name  = "QueueName"
        value = "marginly-${var.environment}-webhook-queue"
      }
    }
  }
}

resource "aws_appautoscaling_target" "pdf" {
  max_capacity       = 3
  min_capacity       = 0
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.pdf.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "pdf_sqs_depth" {
  name               = "marginly-${var.environment}-pdf-sqs-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.pdf.resource_id
  scalable_dimension = aws_appautoscaling_target.pdf.scalable_dimension
  service_namespace  = aws_appautoscaling_target.pdf.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 5
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    customized_metric_specification {
      metric_name = "ApproximateNumberOfMessagesVisible"
      namespace   = "AWS/SQS"
      statistic   = "Average"
      unit        = "Count"

      dimensions {
        name  = "QueueName"
        value = "marginly-${var.environment}-pdf-jobs"
      }
    }
  }
}
