#!/usr/bin/env bash
set -euo pipefail
ENV="${1:-prod}"
PREFIX="/marginly/$ENV"

echo "=== Marginly Secret Rotation Reminder ==="
echo "Environment: $ENV"
echo ""
echo "Secrets that SHOULD have 90-day auto-rotation configured in Secrets Manager:"
echo ""

aws secretsmanager list-secrets \
  --filters Key=name,Values="$PREFIX/" \
  --query 'SecretList[*].{Name:Name,LastRotatedDate:LastRotatedDate,RotationEnabled:RotationEnabled}' \
  --output table

echo ""
echo "Secrets without rotation enabled need a rotation Lambda — see docs/security-architecture.md Section 2a"
echo ""
echo "To manually rotate a specific secret:"
echo "  aws secretsmanager rotate-secret --secret-id $PREFIX/jwt_private_key"
