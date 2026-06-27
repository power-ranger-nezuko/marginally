# Security Architecture — Marginly

*This document audits the current design against the threat model of a
multi-tenant SaaS that stores other companies' payment-processor credentials,
and prescribes specific AWS controls to address each risk. Read alongside
`project-plan.md` Section 2 and `pricing-strategy.md` Section 2.*

---

## 1. Threat Model

Marginly's attack surface is unusual because **a breach doesn't just expose
Marginly's data — it can expose every tenant's Stripe, Shopify, and QuickBooks
account.** The risk surface, ranked by blast radius:

| Risk | Blast radius | Likelihood without controls |
|---|---|---|
| Stored third-party credentials (Stripe/Shopify/QB) exfiltrated | All tenants' payment accounts | High — plaintext secrets in env vars is the default path |
| Cross-tenant data leak (missing `tenant_id` WHERE clause) | One or many tenants' revenue data | Medium — any ORM mistake or N+1 shortcut hits this |
| Stripe webhook spoofing | Arbitrary dunning / replay events injected | High — common for apps that skip signature verification |
| Compromised IAM key via leaked `.env` | Full AWS account access | High — the `.env.example` has `AWS_ACCESS_KEY_ID` fields |
| JWT secret exposure → session forgery | All accounts | High if secret lives in `.env` file in repo |
| SQL injection via untrusted webhook payloads | All data | Medium |
| Cancellation-save widget CSRF / clickjacking | Merchant's end-customers | Low-medium |
| Brute-force login | Individual accounts | Medium without rate limiting |

---

## 2. Critical Fixes (before any customer data is live)

### 2a. Never store third-party credentials in plaintext

**Problem:** The `.env.example` layout puts Stripe, Shopify, QuickBooks, and
Xero secrets in environment variables. In practice these end up in ECS task
definitions, SSM Parameter Store as plain strings, or even committed to git.

**Fix — envelope encryption via AWS KMS + Secrets Manager:**

```
┌─────────────────────────────────────────────────────────────┐
│  When a tenant connects their Stripe account                │
│                                                             │
│  1. Receive OAuth access_token from Stripe                  │
│  2. Call KMS.Encrypt(plaintext=token, KeyId=marginly-creds-key) │
│  3. Store ciphertext in Connection.encrypted_credentials    │
│     (the KMS key never leaves AWS HSMs)                     │
│                                                             │
│  When a worker needs to call the Stripe API                 │
│                                                             │
│  1. Load ciphertext from DB                                 │
│  2. Call KMS.Decrypt() — succeeds only if the ECS task      │
│     role has kms:Decrypt permission on that specific key    │
│  3. Use plaintext token in-memory; never log it             │
└─────────────────────────────────────────────────────────────┘
```

The IAM role for the ECS task running the API server gets:
```json
{
  "Effect": "Allow",
  "Action": ["kms:Decrypt"],
  "Resource": "arn:aws:kms:us-east-1:ACCOUNT:key/marginly-creds-key"
}
```

The worker task role gets the same. Every other role — CI/CD, developers,
monitoring — gets nothing. This way a stolen database dump is worthless; the
attacker still needs AWS credentials with KMS access.

**Your own platform secrets** (JWT_SECRET, Stripe platform key, Postmark key)
go into AWS Secrets Manager under structured paths:
```
/marginly/prod/jwt_secret
/marginly/prod/stripe_platform_key
/marginly/prod/postmark_key
```

The ECS task definition references them as `secrets:` entries — they are
injected at container start and never appear in plaintext in the task def.
Remove `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from `.env.example`
entirely — the app running on ECS should authenticate via instance metadata
(IAM role), not static keys.

### 2b. Remove static IAM access keys entirely

**Problem:** `.env.example` has `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
Long-lived static keys are the #1 cause of AWS account compromise.

**Fix:**
- ECS tasks → IAM task role (automatic, no keys needed)
- Local dev → `aws sso login` via AWS Identity Center (SSO), or short-lived
  credentials via `aws sts assume-role`
- CI/CD (GitHub Actions) → OIDC federation:

```yaml
# .github/workflows/deploy.yml
permissions:
  id-token: write
  contents: read
steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::ACCOUNT:role/marginly-github-deploy
      aws-region: us-east-1
```

This means **zero long-lived AWS keys exist anywhere** — CI gets a 15-minute
token that is never stored.

### 2c. Postgres Row-Level Security from day one

**Problem:** The plan says "ship with app-layer scoping in week 1, then add
RLS before first paid pilot." This is the right instinct but the timing is
wrong — RLS takes a day to add and is much harder to retrofit under load.

**Fix:** Add RLS policies alongside your initial schema migrations, before any
code ships. The pattern is:

```sql
-- In every migration that creates a module table:
ALTER TABLE failed_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON failed_payments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- In app code (NestJS middleware / FastAPI dependency):
-- SET LOCAL app.current_tenant_id = '<uuid from JWT>';
```

With this in place, a missing `WHERE tenant_id = ?` in application code
returns zero rows instead of all tenants' rows. It also prevents any
future ORM mistake, raw query shortcut, or staff DB access from leaking data.

### 2d. Stripe / Shopify webhook signature verification

**Problem:** Not mentioned in the current architecture, but it is the most
common way dunning/webhook systems get abused. A forged `invoice.payment_failed`
event triggers recovery emails to real customers with wrong data.

**Fix:** Verify signatures before touching the payload:

```typescript
// NestJS webhook controller
import Stripe from 'stripe';

@Post('/webhooks/stripe')
async handleStripe(@Req() req: RawBodyRequest, @Headers('stripe-signature') sig: string) {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,          // must be raw Buffer, not parsed JSON
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    throw new BadRequestException('Invalid webhook signature');
  }
  // now safe to process event
}
```

Key requirements:
- Use the **raw request body** (before JSON parsing) for signature verification.
  This means the webhook route must bypass the global `json()` body parser.
- Store `STRIPE_WEBHOOK_SECRET` in Secrets Manager, not `.env`.
- For Shopify: verify `X-Shopify-Hmac-SHA256` header using `SHOPIFY_API_SECRET`.
- Return `200 OK` to Stripe even if your processing fails — Stripe will retry
  on 4xx/5xx, which can cause duplicate events. Queue immediately and ack.

---

## 3. AWS Network Architecture

```
┌─────────────────────────────── AWS VPC (10.0.0.0/16) ──────────────────────────────┐
│                                                                                      │
│  ┌──── Public Subnets (10.0.1.x, 10.0.2.x) ────────────────────────────────────┐   │
│  │                                                                               │   │
│  │   ┌──────────┐    ┌──────────────────────┐    ┌───────────────────────────┐  │   │
│  │   │  Route53  │──▶│  CloudFront (CDN)     │    │  Application Load        │  │   │
│  │   │  + ACM   │    │  - Frontend SPA       │    │  Balancer (ALB)          │  │   │
│  │   └──────────┘    │  - Invoice PDFs (S3)  │    │  - HTTPS only (443)      │  │   │
│  │                   │  - Save widget JS     │    │  - HTTP→HTTPS redirect   │  │   │
│  │                   │  - WAF attached       │    │  - WAF attached          │  │   │
│  │                   └──────────────────────┘    └────────────┬──────────────┘  │   │
│  │                                                            │                 │   │
│  │   ┌─────────────────────────────────────────────────────┐  │                 │   │
│  │   │  NAT Gateways (one per AZ for HA)                   │  │                 │   │
│  │   └─────────────────────────────────────────────────────┘  │                 │   │
│  └───────────────────────────────────────────────────────────-│─────────────────┘   │
│                                                               │                      │
│  ┌──── Private App Subnets (10.0.3.x, 10.0.4.x) ────────────▼─────────────────┐   │
│  │                                                                               │   │
│  │   ┌──────────────────────────────────────────────────────────────────────┐   │   │
│  │   │  ECS Fargate Cluster                                                  │   │   │
│  │   │                                                                       │   │   │
│  │   │  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │   │   │
│  │   │  │  API Service    │  │  Worker Service  │  │  PDF Renderer    │    │   │   │
│  │   │  │  (NestJS/FastAPI│  │  (BullMQ/Celery) │  │  (Puppeteer)     │    │   │   │
│  │   │  │  Task role:     │  │  Task role:      │  │  Task role:      │    │   │   │
│  │   │  │  kms:Decrypt    │  │  kms:Decrypt     │  │  s3:PutObject    │    │   │   │
│  │   │  │  secretsmanager │  │  secretsmanager  │  │  (invoices only) │    │   │   │
│  │   │  │  No static keys │  │  ses:SendEmail   │  └──────────────────┘    │   │   │
│  │   │  └─────────────────┘  └──────────────────┘                          │   │   │
│  │   └──────────────────────────────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│  ┌──── Private Data Subnets (10.0.5.x, 10.0.6.x) ──────────────────────────────┐  │
│  │                                                                                │  │
│  │   ┌──────────────────────────┐    ┌────────────────────────┐                 │  │
│  │   │  RDS PostgreSQL (Multi-AZ│    │  ElastiCache Redis     │                 │  │
│  │   │  db.t4g.micro → scale up)│    │  (cluster mode off,    │                 │  │
│  │   │  - Encryption at rest    │    │   TLS in-transit)      │                 │  │
│  │   │  - Automated backups 7d  │    │  - AUTH token required │                 │  │
│  │   │  - No public access      │    │  - No public access    │                 │  │
│  │   │  - RLS enabled           │    └────────────────────────┘                 │  │
│  │   └──────────────────────────┘                                               │  │
│  └────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────┘

Supporting AWS services (all private / no public endpoints):
  - AWS KMS: envelope encryption key for tenant credentials
  - AWS Secrets Manager: platform secrets (/marginly/prod/*)
  - Amazon SQS: webhook ingestion queue + dead-letter queue
  - Amazon S3: invoices (private), frontend build (public via CloudFront only)
  - AWS WAF: attached to both ALB and CloudFront
  - AWS CloudTrail: all API calls logged to S3
  - AWS GuardDuty: threat detection across the account
  - AWS Config: drift detection on security-critical resources
```

### Security groups (least-privilege)

```
alb-sg:
  inbound:  443 from 0.0.0.0/0 (CloudFront managed prefix list only)
  outbound: 4000 to app-sg

app-sg:
  inbound:  4000 from alb-sg only
  outbound: 5432 to db-sg, 6379 to redis-sg, 443 to 0.0.0.0/0 (NAT → external APIs)

db-sg:
  inbound:  5432 from app-sg only
  outbound: none

redis-sg:
  inbound:  6379 from app-sg only
  outbound: none
```

The database and Redis have **no inbound from anything except the app**. Staff
connect via AWS Systems Manager Session Manager (no SSH, no bastion host).

---

## 4. AWS WAF Rules (attach to both ALB and CloudFront)

```
Rule group: marginly-core-protection
  1. AWS-AWSManagedRulesCommonRuleSet        (OWASP Top 10 baseline)
  2. AWS-AWSManagedRulesKnownBadInputsRuleSet (log4j, SSRF, etc.)
  3. AWS-AWSManagedRulesSQLiRuleSet           (SQL injection)
  4. Rate limit: 2000 req/5min per IP        (brute-force protection)

Additional custom rules:
  5. /api/auth/login → 20 req/5min per IP   (login brute-force)
  6. /webhooks/*    → allow only Stripe/Shopify CIDR ranges
     Stripe IPs: https://stripe.com/docs/ips
     Shopify IPs: Shopify publishes these; also enforce via HMAC (belt+suspenders)
  7. Block requests with no User-Agent (bot mitigation on the dashboard)
```

---

## 5. Authentication & Session Security

### JWT hardening

```typescript
// Use RS256 (asymmetric) instead of HS256 (symmetric shared secret)
// Private key: in Secrets Manager, loaded at startup
// Public key: can be distributed for verification without exposing signing capability

const token = jwt.sign(
  {
    sub: user.id,
    tid: user.tenantId,     // tenant context baked into token
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
  },
  privateKey,
  {
    algorithm: 'RS256',
    expiresIn: '15m',       // short-lived access token
    issuer: 'https://api.usemarginly.com',
    audience: 'https://app.usemarginly.com',
  }
);
```

Pair with a refresh token stored **HttpOnly, Secure, SameSite=Strict** cookie
(never in localStorage). Refresh tokens stored in Redis with a 30-day TTL and
a `refresh_token_id` claim that can be revoked by deleting the Redis key.

### Multi-tenant token validation middleware

```typescript
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const payload = verifyJwt(req.headers.authorization);
    // Set Postgres session variable for RLS
    req.db.query(`SET LOCAL app.current_tenant_id = $1`, [payload.tid]);
    req.tenant = { id: payload.tid, userId: payload.sub, role: payload.role };
    next();
  }
}
```

### Password policy

- Minimum 12 characters, checked against HaveIBeenPwned API (k-anonymity model — no plaintext transmitted).
- bcrypt cost factor 12 (re-evaluate annually as hardware improves).
- Account lockout after 10 failed attempts (15-minute lock, logged to AuditLog).

---

## 6. Data Security

### Encryption at rest

| Data | Encryption |
|---|---|
| RDS Postgres | AES-256, AWS-managed KMS key (enable at creation — can't add later without recreation) |
| ElastiCache Redis | AES-256, AWS-managed KMS key |
| S3 (invoices bucket) | SSE-S3 (default), upgrade to SSE-KMS to log every key usage in CloudTrail |
| Secrets Manager | Automatically encrypted by KMS |
| Tenant third-party credentials | Envelope-encrypted by dedicated `marginly-creds-key` (customer-managed KMS key) |

### Encryption in transit

- TLS 1.2 minimum everywhere (ALB policy: `ELBSecurityPolicy-TLS13-1-2-2021-06`)
- Redis: `--tls-cluster yes` and `requirepass` with a strong token
- RDS: `ssl=true` in connection string; reject non-TLS connections
- Internal service-to-service calls (ECS → SQS, etc.) use HTTPS AWS SDK defaults

### S3 invoice bucket hardening

```hcl
# terraform/modules/s3/invoices.tf
resource "aws_s3_bucket_public_access_block" "invoices" {
  bucket                  = aws_s3_bucket.invoices.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Invoices are served via CloudFront with signed URLs — never directly from S3
resource "aws_s3_bucket_policy" "invoices" {
  policy = jsonencode({
    Statement = [{
      Principal = { "AWS": aws_cloudfront_origin_access_identity.invoices.iam_arn }
      Action    = ["s3:GetObject"]
      Effect    = "Allow"
      Resource  = "${aws_s3_bucket.invoices.arn}/*"
    }]
  })
}
```

Tenants receive **CloudFront signed URLs** (15-minute expiry) to download their
invoices. S3 is never directly exposed.

---

## 7. Third-Party Credential Storage (the most sensitive piece)

The `Connection` table stores encrypted OAuth tokens for each tenant's
Stripe/Shopify/QuickBooks/Xero accounts. Here is the complete secure pattern:

```
Database row (Connection table):
  tenant_id:               uuid (RLS scoped)
  provider:                'stripe'
  encrypted_credentials:   base64(KMS ciphertext) -- never decrypted in DB layer
  credential_key_version:  1 -- tracks which KMS key version encrypted this
  status:                  'active'
  connected_at:            timestamp
  last_used_at:            timestamp
  scopes:                  text[] -- only store what was actually granted

What is NEVER stored:
  - Plaintext tokens / secrets
  - Stripe restricted-key raw value before encryption
  - QuickBooks refresh token unencrypted
```

**Scope minimisation:** request only the OAuth scopes you actually need, listed
explicitly in the Shopify/QuickBooks OAuth request. Don't request write scopes
if a module only reads data.

**Token rotation:** QuickBooks and Xero access tokens expire in 30 minutes; the
worker service refreshes them automatically and re-encrypts the new token. Log
every rotation event to AuditLog (without logging the token value).

---

## 8. Webhook Ingestion Pipeline (Module 6 shared infrastructure)

The ingestion path is the highest-throughput, most attacker-accessible endpoint
in the system. Harden it independently:

```
Internet → CloudFront WAF → ALB → /webhooks/* route
                                        │
                         ┌──────────────▼──────────────┐
                         │  Webhook Ingestion Handler   │
                         │  1. Verify HMAC signature    │
                         │  2. Idempotency check        │
                         │     (event_id in Redis,      │
                         │      30-day TTL)             │
                         │  3. Store raw payload to SQS │
                         │  4. Return 200 immediately   │
                         └──────────────┬───────────────┘
                                        │ SQS (encrypted, VPC endpoint)
                         ┌──────────────▼───────────────┐
                         │  Worker: process event        │
                         │  - Deserialise payload        │
                         │  - Route to correct module    │
                         │  - Update WebhookEvent row    │
                         └──────────────┬───────────────┘
                                        │ On failure after N retries
                         ┌──────────────▼───────────────┐
                         │  SQS Dead-Letter Queue        │
                         │  + CloudWatch alarm           │
                         │  → SNS → email/Slack alert    │
                         └───────────────────────────────┘
```

**Idempotency is a security control here, not just a reliability one.** A
Stripe webhook for `invoice.payment_failed` that gets delivered twice must
not send two recovery emails to the merchant's customer.

Use a Redis `SET event_id NX EX 2592000` (30 days) call before enqueuing;
if the key already exists, return 200 without re-enqueueing.

---

## 9. The Cancellation Save-Flow Widget (Module 2)

This is the only Marginly component that runs in an end-customer's browser
(i.e., on the merchant's checkout page). It has a different threat surface:

### Content Security Policy for the widget host page

The widget is a JS snippet the merchant embeds. Marginly has no control over
the merchant's page, but Marginly's own widget endpoint must:

```
# CloudFront response headers for /widget/* assets
Content-Security-Policy: default-src 'self'; frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
```

### The offer-serving API

The widget calls `api.usemarginly.com/v1/offers/{tenant_id}` to fetch the offer
for a given customer. This endpoint:

- Is **unauthenticated** (customer is not logged into Marginly)
- Must be rate-limited aggressively (WAF rule: 100 req/min per IP)
- Must return **no PII** — only the offer type and display copy, never the
  customer's billing details
- Must validate the `tenant_id` is a valid, active tenant (prevents enumeration)
- The `customer_id` parameter must be an opaque token (not the raw Stripe
  customer ID, which could be guessed) — use an HMAC-signed token that the
  merchant's backend generates server-side

---

## 10. Audit Logging

Every security-relevant event goes to the `AuditLog` table and is also
streamed to CloudWatch Logs for immutability:

```
Events to log (always, never skip):
  - Login success / failure (with IP, user-agent)
  - Token refresh
  - Any change to a Connection (Stripe connected / disconnected / re-authenticated)
  - Any change to tenant plan / billing status
  - Credential decrypt call (who, which tenant, which provider, when)
  - Any admin action performed by Marginly staff on a tenant's data
  - Webhook replay (who triggered it, which event)
  - Failed webhook signature verification (potential attack signal)
  - Role changes (user promoted to admin)
  - User invite sent / accepted / revoked

Fields on every log entry:
  tenant_id, actor_user_id, action, resource_type, resource_id,
  ip_address, user_agent, metadata_json, created_at

Never log:
  - Credential values (even encrypted ones)
  - Full JWT tokens
  - Customer PII beyond what's needed for the audit record
```

Enable **CloudTrail** across the AWS account (log all regions, log to S3,
enable CloudTrail log file validation). This gives you a tamper-evident log
of every AWS API call — critical for breach forensics.

---

## 11. IAM Least-Privilege Roles

One role per ECS service, scoped to exactly what that service needs:

```
marginly-api-task-role:
  - kms:Decrypt on marginly-creds-key
  - secretsmanager:GetSecretValue on /marginly/prod/*
  - s3:PutObject on marginly-invoices/* (only for PDF upload path)
  - sqs:SendMessage on marginly-webhook-queue
  - NO: s3:DeleteObject, s3:GetObject (API doesn't read invoices)
  - NO: kms:CreateKey, kms:ScheduleKeyDeletion

marginly-worker-task-role:
  - kms:Decrypt on marginly-creds-key
  - secretsmanager:GetSecretValue on /marginly/prod/*
  - sqs:ReceiveMessage, sqs:DeleteMessage on marginly-webhook-queue
  - ses:SendEmail (or postmark via HTTPS, no SES permission needed)
  - NO: s3:PutObject (worker doesn't write invoices)

marginly-pdf-task-role:
  - s3:PutObject on marginly-invoices/*
  - secretsmanager:GetSecretValue on /marginly/prod/postmark_key
  - NO: kms:Decrypt (PDF renderer never touches tenant credentials)

marginly-github-deploy-role (assumed via OIDC only):
  - ecr:GetAuthorizationToken, ecr:PutImage
  - ecs:UpdateService, ecs:RegisterTaskDefinition
  - NO: iam:PassRole to arbitrary roles (only to the task roles above)
  - NO: s3:DeleteObject, rds:DeleteDBInstance
```

---

## 12. Monitoring & Incident Response

### CloudWatch alarms to set up from day one

| Alarm | Threshold | Action |
|---|---|---|
| Failed login attempts | >50/min across all tenants | SNS → PagerDuty / email |
| Webhook signature failures | >10/min | SNS alert (possible attack) |
| DB connection count > 80% of max | 80% | SNS → scale ECS app |
| SQS DLQ message count > 0 | 1 message | SNS alert |
| ECS task exit code non-zero | Any | SNS alert |
| RDS storage < 20% free | 20% | SNS alert |
| KMS decrypt errors | >5/min | SNS alert (possible key misconfiguration or attack) |
| CloudTrail: root account login | Any | SNS alert immediately |

### GuardDuty

Enable GuardDuty (one click, ~$3/mo at this scale) from day one. It
automatically detects:
- Unusual API calls from unexpected IPs
- S3 bucket policy changes (prevents accidental public exposure)
- Port scanning against your VPC
- Credential exfiltration patterns

### Incident response runbook (stub — expand before first customer)

```
P0 — Credential breach suspected:
  1. Rotate all Secrets Manager values immediately
  2. Disable all active ECS tasks (scale to 0)
  3. Audit CloudTrail for the past 72h around the suspected event
  4. Revoke all active Stripe Connect OAuth tokens via Stripe dashboard
  5. Notify affected tenants within 72h (GDPR/CCPA requirement)
  6. Engage AWS Support (if account compromised)
```

---

## 13. Pre-Launch Security Checklist

Before the first paying customer's data enters the system:

- [ ] RLS policies in place on all tables
- [ ] All tenant credentials envelope-encrypted via KMS (no plaintext in DB)
- [ ] Zero long-lived IAM access keys in any environment
- [ ] GitHub Actions using OIDC (no `AWS_ACCESS_KEY_ID` in secrets)
- [ ] WAF attached to ALB and CloudFront with rate limiting active
- [ ] Stripe + Shopify webhook signature verification in place with raw body parsing
- [ ] Redis AUTH token set and TLS enabled
- [ ] RDS public access disabled, encryption at rest enabled
- [ ] S3 invoice bucket has public access block enabled, served via signed CloudFront URLs
- [ ] GuardDuty enabled in all regions you use
- [ ] CloudTrail enabled (all regions, log validation on)
- [ ] JWT using RS256, 15-minute access token expiry
- [ ] Login rate limiting (WAF rule + app-layer lockout after 10 failures)
- [ ] HaveIBeenPwned check on signup/password-change
- [ ] AuditLog table receiving events for the 15 event types listed in Section 10
- [ ] Cancellation widget offer-serving API rate-limited to 100 req/min per IP
- [ ] Dependency vulnerability scan passing (`npm audit` / `pip audit`) in CI
- [ ] Secrets Manager rotation enabled for JWT and platform Stripe key (90-day auto-rotation)
