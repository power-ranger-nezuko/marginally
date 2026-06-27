resource "aws_kms_key" "creds" {
  description             = "Marginly tenant credential envelope encryption key"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowAccountRoot"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${var.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowApiTaskDecrypt"
        Effect = "Allow"
        Principal = {
          AWS = var.api_role_arn
        }
        Action   = ["kms:Decrypt", "kms:DescribeKey"]
        Resource = "*"
      },
      {
        Sid    = "AllowWorkerTaskDecrypt"
        Effect = "Allow"
        Principal = {
          AWS = var.worker_role_arn
        }
        Action   = ["kms:Decrypt", "kms:DescribeKey"]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.common_tags, { Name = "marginly-${var.environment}-creds-key" })
}

resource "aws_kms_alias" "creds" {
  name          = "alias/marginly-creds-key"
  target_key_id = aws_kms_key.creds.key_id
}
