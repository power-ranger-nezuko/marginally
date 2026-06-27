data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ── API Task Role ─────────────────────────────────────────────────────────────
resource "aws_iam_role" "api_task" {
  name               = "marginly-${var.environment}-api-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-api-task-role" })
}

resource "aws_iam_role_policy" "api_task" {
  name = "marginly-${var.environment}-api-task-policy"
  role = aws_iam_role.api_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "KmsDecrypt"
        Effect = "Allow"
        Action = ["kms:Decrypt", "kms:DescribeKey"]
        Resource = [var.kms_key_arn]
      },
      {
        Sid    = "SecretsManagerRead"
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = ["${var.secrets_prefix_arn}"]
      },
      {
        Sid    = "S3PutInvoices"
        Effect = "Allow"
        Action = ["s3:PutObject"]
        Resource = ["${var.invoices_bucket_arn}/*"]
      },
      {
        Sid    = "SqsSendWebhook"
        Effect = "Allow"
        Action = ["sqs:SendMessage"]
        Resource = [var.webhook_queue_arn]
      }
    ]
  })
}

# ── Worker Task Role ──────────────────────────────────────────────────────────
resource "aws_iam_role" "worker_task" {
  name               = "marginly-${var.environment}-worker-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-worker-task-role" })
}

resource "aws_iam_role_policy" "worker_task" {
  name = "marginly-${var.environment}-worker-task-policy"
  role = aws_iam_role.worker_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "KmsDecrypt"
        Effect = "Allow"
        Action = ["kms:Decrypt", "kms:DescribeKey"]
        Resource = [var.kms_key_arn]
      },
      {
        Sid    = "SecretsManagerRead"
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = ["${var.secrets_prefix_arn}"]
      },
      {
        Sid    = "SqsWebhookQueue"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:ChangeMessageVisibility",
          "sqs:GetQueueAttributes"
        ]
        Resource = [var.webhook_queue_arn]
      },
      {
        Sid    = "SesSendEmail"
        Effect = "Allow"
        Action = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = ["*"]
      },
      {
        Sid    = "SnsSendSms"
        Effect = "Allow"
        Action = ["sns:Publish"]
        Resource = ["*"]
      }
    ]
  })
}

# ── PDF Task Role ──────────────────────────────────────────────────────────────
resource "aws_iam_role" "pdf_task" {
  name               = "marginly-${var.environment}-pdf-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-pdf-task-role" })
}

resource "aws_iam_role_policy" "pdf_task" {
  name = "marginly-${var.environment}-pdf-task-policy"
  role = aws_iam_role.pdf_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3PutInvoices"
        Effect = "Allow"
        Action = ["s3:PutObject"]
        Resource = ["${var.invoices_bucket_arn}/*"]
      },
    ]
  })
}

# ── ECS Task Execution Role ───────────────────────────────────────────────────
resource "aws_iam_role" "execution" {
  name               = "marginly-${var.environment}-ecs-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-ecs-execution-role" })
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "marginly-${var.environment}-execution-secrets"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "SecretsManagerRead"
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue"]
      Resource = ["${var.secrets_prefix_arn}"]
    }]
  })
}

# ── GitHub Deploy Role (OIDC) ─────────────────────────────────────────────────
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
  ]

  tags = merge(var.common_tags, { Name = "github-actions-oidc" })
}

resource "aws_iam_role" "github_deploy" {
  name = "marginly-${var.environment}-github-deploy-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:ref:refs/heads/*"
        }
      }
    }]
  })

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-github-deploy-role" })
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "marginly-${var.environment}-github-deploy-policy"
  role = aws_iam_role.github_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRAuth"
        Effect = "Allow"
        Action = ["ecr:GetAuthorizationToken"]
        Resource = ["*"]
      },
      {
        Sid    = "ECRPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ]
        Resource = ["arn:aws:ecr:${var.aws_region}:${var.account_id}:repository/marginly-api"]
      },
      {
        Sid    = "ECSUpdate"
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:RegisterTaskDefinition",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition"
        ]
        Resource = ["*"]
      },
      {
        Sid    = "IamPassRoleToTaskRoles"
        Effect = "Allow"
        Action = ["iam:PassRole"]
        Resource = [
          aws_iam_role.api_task.arn,
          aws_iam_role.worker_task.arn,
          aws_iam_role.pdf_task.arn,
          aws_iam_role.execution.arn
        ]
      }
    ]
  })
}
