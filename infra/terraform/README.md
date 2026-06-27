# Terraform — Marginly Infrastructure

See `docs/security-architecture.md` for the full network diagram and security
rationale behind each resource below.

## Module plan

```
infra/terraform/
├── main.tf                  # provider config, backend (S3 + DynamoDB state locking)
├── variables.tf
├── outputs.tf
└── modules/
    ├── vpc/                 # VPC, public/private/data subnets, NAT gateways, VPC endpoints
    ├── ecs/                 # ECS cluster, 3 services (api, worker, pdf-renderer)
    ├── rds/                 # RDS Postgres Multi-AZ, encryption, no public access
    ├── elasticache/         # Redis, TLS, AUTH token, private subnet
    ├── s3/                  # invoices bucket (private) + CloudFront OAI; frontend bucket
    ├── kms/                 # marginly-creds-key (tenant credential encryption)
    ├── secrets/             # Secrets Manager paths + rotation configs
    ├── alb/                 # ALB, HTTPS listener, HTTP→HTTPS redirect, WAF association
    ├── cloudfront/          # CDN for frontend SPA + invoices, WAF association
    ├── waf/                 # WAF web ACL with managed rule groups + custom rate limits
    ├── iam/                 # Task roles (api, worker, pdf), deploy role (OIDC)
    ├── sqs/                 # Webhook queue + dead-letter queue, SQS KMS encryption
    ├── route53/             # Hosted zone, A records (ALB alias + CloudFront alias)
    ├── acm/                 # TLS certificate (us-east-1 for CloudFront, regional for ALB)
    ├── cloudwatch/          # Log groups, alarms (Section 12 of security-architecture.md)
    ├── cloudtrail/          # All-region trail, S3 destination, log validation
    └── guardduty/           # GuardDuty detector, threat intel
```

## State backend

Store Terraform state in S3 with DynamoDB locking — never commit `.tfstate`:

```hcl
terraform {
  backend "s3" {
    bucket         = "marginly-tf-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "marginly-tf-locks"
  }
}
```

Bootstrap this bucket and table manually once (or with a separate `bootstrap/`
config) before running any module.

## Key security decisions encoded in Terraform

- **No public RDS**: `publicly_accessible = false`, data subnets have no route
  to internet gateway
- **RDS encryption**: `storage_encrypted = true` — must be set at creation,
  cannot be added later
- **S3 public access block**: all four block settings `= true` on every bucket
- **CloudFront OAI**: invoices S3 bucket only allows GET from the CloudFront
  origin access identity, blocking direct S3 URL access
- **WAF on both ALB and CloudFront**: different WAF ACLs (CloudFront requires
  us-east-1 region); both include AWS managed rule groups and rate limiting
- **VPC endpoints for AWS services**: S3, Secrets Manager, KMS, SQS endpoints
  inside the VPC so traffic never leaves the AWS network
- **ECS task roles, not static keys**: `execution_role_arn` and `task_role_arn`
  are separate; static AWS credentials must not appear in task definitions

## Environments

Use Terraform workspaces or separate state paths for `staging` and `prod`.
Staging can use smaller instance types (`db.t4g.micro`, `cache.t4g.micro`,
0.25 vCPU Fargate) to keep cost low while matching the production architecture
exactly. This matters for security — the RLS policies, WAF rules, and IAM
boundaries must be identical between staging and production.

## Not yet written

These modules are stubs. The Phase 0 checklist in `docs/project-plan.md` and
the pre-launch checklist in `docs/security-architecture.md` define what each
must implement.
