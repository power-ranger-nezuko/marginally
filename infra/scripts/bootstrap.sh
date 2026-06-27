#!/usr/bin/env bash
set -euo pipefail

# Creates S3 state bucket and DynamoDB lock table for Terraform
# Run once before first `terraform init`

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="marginly-tf-state-${ACCOUNT_ID}"
TABLE="marginly-tf-locks"

echo "Creating Terraform state bucket: $BUCKET"
if aws s3 ls "s3://$BUCKET" 2>/dev/null; then
  echo "Bucket already exists, skipping"
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    $([ "$REGION" != "us-east-1" ] && echo "--create-bucket-configuration LocationConstraint=$REGION" || echo "")
  aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
  aws s3api put-bucket-encryption --bucket "$BUCKET" \
    --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
  aws s3api put-public-access-block --bucket "$BUCKET" \
    --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  echo "Bucket created and secured."
fi

echo "Creating DynamoDB lock table: $TABLE"
if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" 2>/dev/null; then
  echo "Table already exists, skipping"
else
  aws dynamodb create-table \
    --table-name "$TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION"
  echo "DynamoDB table created."
fi

echo ""
echo "Bootstrap complete. Update infra/terraform/main.tf backend config:"
echo "  bucket = \"$BUCKET\""
echo "  region = \"$REGION\""
