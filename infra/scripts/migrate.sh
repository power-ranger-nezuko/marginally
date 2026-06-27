#!/usr/bin/env bash
set -euo pipefail
ENV="${1:-prod}"
IMAGE_TAG="${2:-latest}"
CLUSTER="marginly-${ENV}"
SERVICE="api-service"

echo "Running Prisma migrations on $ENV via ECS Exec..."
TASK_ARN=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" --query 'taskArns[0]' --output text)
if [[ -z "$TASK_ARN" || "$TASK_ARN" == "None" ]]; then
  echo "No running tasks found in $CLUSTER/$SERVICE"
  exit 1
fi
CONTAINER=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].name' --output text)
aws ecs execute-command \
  --cluster "$CLUSTER" \
  --task "$TASK_ARN" \
  --container "$CONTAINER" \
  --interactive \
  --command "npx prisma migrate deploy"
echo "Migrations complete."
