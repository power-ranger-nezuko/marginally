#!/usr/bin/env bash
set -euo pipefail
ENV="${1:-staging}"
echo "Deploying to environment: $ENV"
cd "$(dirname "$0")/../terraform"
terraform workspace select "$ENV" 2>/dev/null || terraform workspace new "$ENV"
terraform plan -var="environment=$ENV" -out=tfplan
read -p "Apply this plan? [y/N] " confirm
[[ "$confirm" == "y" || "$confirm" == "Y" ]] || { echo "Aborted."; exit 0; }
terraform apply tfplan
echo "Deploy complete."
