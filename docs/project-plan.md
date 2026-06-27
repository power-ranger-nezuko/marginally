# Merchant Revenue Toolkit — Multi-Tenant SaaS Project Plan

**Working name:** *Marginly* (placeholder — swap for whatever you like; "protect your margin" is the positioning idea behind it)

**One-line pitch:** Stripe and Shopify tell you what happened to your money. Marginly stops you from losing it — recovering failed payments, saving cancellations, winning disputes, syncing your books, branding your invoices, and catching broken webhooks, all from one dashboard.

This document combines all 6 modules into a single multi-tenant platform, with a phased build plan, hosting/infra steps, and a marketing plan woven into each phase.

---

## 1. Product Overview

### The 6 modules (your original ideas, now as one product)

| # | Module | Core job | Primary buyer pain |
|---|--------|----------|---------------------|
| 1 | **Dunning / Failed Payment Recovery** | Retry failed Stripe charges, send recovery emails/SMS | "We're losing MRR silently every month" |
| 2 | **Cancellation Save-Flow** | Intercept cancel button, offer discount/pause/downgrade | "Customers cancel with one click and we never get a chance to save them" |
| 3 | **Dispute/Chargeback Evidence Automation** | Auto-assemble & submit dispute evidence to Stripe | "We lose disputes we should win because evidence submission is a manual scramble" |
| 4 | **Stripe → Accounting Sync** | Reconcile Stripe fees/refunds/revenue into QuickBooks/Xero | "Our books never match what Stripe actually charged" |
| 5 | **Branded Invoices & Receipts** | Branded, localized, tax-correct PDF invoices | "Stripe's default invoice looks like it's from 2015 and confuses overseas customers" |
| 6 | **Webhook Monitoring & Replay** | Log, alert on, and replay failed Stripe/Shopify webhooks | "We don't even know when a webhook silently failed until a customer complains" |

### Why bundle them
Each module is individually sellable (and several have funded competitors — proof the pain is real), but they share the same underlying need: **a tenant's Stripe/Shopify connection, synced data, and a dashboard.** Building them on one shared core means each new module after the first 1–2 is dramatically cheaper to ship, and you can upsell existing customers instead of always hunting new ones.

### Why this doesn't compete with AWS
You're selling opinionated, vertical business logic (dunning rules, save offers, accounting field-mapping). AWS deliberately stays out of this layer — the closest AWS gets is raw infra (Lambda, SQS, RDS), which you'll use *as* your hosting, not compete with.

---

## 2. Multi-Tenant Architecture

"Multi-tenant" here means: **one codebase and one set of infrastructure serves many customer companies**, each of whose data must stay fully isolated from the others.

### Core shared tables (every module hangs off these)

```
Tenant
  id, name, plan, billing_status, created_at

User
  id, tenant_id, email, role (owner/admin/member), password_hash

Connection
  id, tenant_id, provider (stripe | shopify | quickbooks | xero),
  encrypted_credentials, status, connected_at

AuditLog
  id, tenant_id, actor_user_id, action, metadata, created_at
```

Every other table in every module includes `tenant_id` and every query is scoped by it. Two implementation options:

- **App-layer scoping** (simpler, faster to ship): every query manually filters `WHERE tenant_id = :current_tenant`. Fast to build, but one missed `WHERE` clause is a data leak.
- **Postgres Row-Level Security (recommended once you have paying customers):** the database itself enforces `tenant_id` isolation, so even a buggy query can't leak across tenants. Takes a bit more setup but is much safer — worth doing before you have real customer financial data flowing through.

**Recommendation:** ship with app-layer scoping in week 1 to move fast, then add RLS policies before your first paid pilot customer goes live (Phase 0, listed below).

### Module-specific tables (all carry `tenant_id`)

```
# Module 1 — Dunning
FailedPayment(stripe_invoice_id, amount, failure_reason, retry_count, status, next_retry_at)
RecoverySequence(name, steps_json)
RecoveryAttempt(failed_payment_id, channel, sent_at, result)

# Module 2 — Cancellation Save-Flow
SaveOffer(type[discount|pause|downgrade], config_json)
CancellationAttempt(external_customer_id, offer_shown, outcome, occurred_at)

# Module 3 — Dispute Evidence
Dispute(stripe_dispute_id, status, amount, evidence_due_by)
EvidenceBundle(dispute_id, order_data, shipping_data, comms_log, submitted_at)

# Module 4 — Accounting Sync
AccountingConnection(provider, oauth_token, refresh_token)
SyncedTransaction(stripe_txn_id, accounting_entry_id, sync_status, synced_at)

# Module 5 — Branded Invoices
InvoiceTemplate(branding_json, locale_settings, tax_settings)
GeneratedInvoice(stripe_invoice_id, pdf_url, language, generated_at)

# Module 6 — Webhook Monitoring
WebhookEvent(provider, event_type, payload, status, received_at, processed_at)
AlertRule(condition_json, notification_channel)
```

### Recommended tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + TypeScript (NestJS) *or* Python (FastAPI) | Matches your backend strength; NestJS gives you multi-tenant module structure for free |
| Database | PostgreSQL | Row-Level Security support, mature, handles relational billing data well |
| Queue/cache | Redis + BullMQ (Node) or Celery (Python) | Needed for retries, scheduled dunning emails, async webhook processing |
| Frontend dashboard | React + Tailwind | Fast to build, large ecosystem |
| Auth | Roll your own JWT + bcrypt, or Clerk/Auth0 if you want to skip building it | Multi-tenant auth (org-scoped sessions) is the one piece worth not under-building |
| PDF generation (Module 5) | Puppeteer/headless Chromium in a container or Lambda | Renders HTML invoice templates to PDF reliably |
| Email/SMS | Postmark or SES (email), Twilio (SMS) | Postmark has the best deliverability reputation for transactional email — matters a lot for dunning |
| Secrets | AWS Secrets Manager or HashiCorp Vault | You're storing customers' Stripe/Shopify API keys — this is the most security-sensitive part of the whole product |

---

## 3. Pricing & Packaging

- **À la carte + bundle hybrid:** each module has a standalone price; a bundle subscription gets a discount. This lets a merchant who only cares about dunning start cheap, while power users upgrade to the full suite.
- **Suggested starting tiers** (validate with early customers, don't treat as fixed):
  - Starter: 1 module, up to $10k/mo processed revenue — $39/mo
  - Growth: 3 modules, up to $50k/mo processed revenue — $129/mo
  - Full Suite: all 6 modules, unlimited — $299/mo
  - Usage add-ons: dunning/save-flow modules can also carry a "% of recovered revenue" option (e.g. 5–10%) for merchants who prefer pay-for-results over flat fees — this is often an easier first sale than a flat subscription.
- **Free trial, not freemium**, for the recovery-style modules (1, 2, 3) — these need real Stripe data flowing to prove value, and a 14-day trial with their actual numbers is your best sales tool. Modules 4–6 can have a generous free tier since they're lower-stakes and good top-of-funnel.

---

## 4. Full Project Plan

Solo backend developer, full-time, realistic pace. Each phase lists **Dev**, **Infra/Hosting**, and **Marketing** tasks together, as requested — they run in parallel, not in sequence.

### Phase 0 — Foundations (Weeks 1–3)

**Dev**
- [ ] Design multi-tenant schema (Tenant, User, Connection, AuditLog)
- [ ] Build signup/login, tenant creation, invite teammates, role-based access
- [ ] Build Stripe Connect (OAuth) flow so customers connect their own Stripe account
- [ ] Build Shopify OAuth app flow
- [ ] Build encrypted credential storage for connected API keys/tokens
- [ ] Set up your own Stripe Billing account to charge *your* customers
- [ ] Scaffold the dashboard shell (nav, tenant switcher, empty module pages)

**Infra/Hosting**
- [ ] Create AWS account, set up billing alerts and IAM users (no root key usage)
- [ ] Stand up VPC, public/private subnets
- [ ] Provision RDS Postgres (start small — `db.t4g.micro` is plenty at this stage)
- [ ] Provision ElastiCache Redis instance
- [ ] Create S3 buckets (one for generated PDFs/invoices, one for backups)
- [ ] Set up AWS Secrets Manager for encrypted Stripe/Shopify credentials
- [ ] Register domain, set up Route 53 + ACM (free SSL)
- [ ] Set up CI/CD (GitHub Actions → deploy to ECS Fargate or Elastic Beanstalk)
- [ ] Stand up staging and production environments separately
- [ ] Basic CloudWatch alarms (CPU, DB connections, error rate)

**Marketing**
- [ ] Register domain + set up a one-page "coming soon" landing site with email waitlist
- [ ] Set up analytics (Plausible or GA4) and a simple CRM (even a spreadsheet/Airtable is fine at this stage)
- [ ] Create accounts on X/Twitter, LinkedIn; start posting build-in-public updates
- [ ] Start a content calendar — list 15–20 SEO target phrases (see Section 5)
- [ ] Identify 5 communities to participate in authentically (Indie Hackers, r/SaaS, r/shopify, r/ecommerce, Stripe Discord/community)

---

### Phase 1 — Module 6: Webhook Monitoring & Replay (Weeks 4–5)

*Built first deliberately — every other module consumes Stripe/Shopify webhooks, so this becomes shared infrastructure, not just a feature.*

**Dev**
- [ ] Build webhook ingestion endpoints for Stripe and Shopify
- [ ] Persist every event (payload, status, timestamps) to `WebhookEvent`
- [ ] Build failure detection (signature mismatch, processing exceptions, timeouts)
- [ ] Build alerting (Slack webhook + email) on failed/dropped events
- [ ] Build manual + automatic replay
- [ ] Build the event log dashboard UI with filters

**Infra/Hosting**
- [ ] Set up SQS (or Redis-backed queue) between ingestion and processing
- [ ] Add a dead-letter queue for events that fail repeatedly
- [ ] Configure autoscaling for the worker process under load spikes

**Marketing**
- [ ] Publish SEO post #1: "How to catch silent Stripe webhook failures before they cost you money"
- [ ] Share in r/SaaS and Indie Hackers as a build-in-public update with a screenshot
- [ ] Start a docs site (even just GitBook or Docusaurus) — devtool buyers expect docs before they'll try anything

---

### Phase 2 — Module 1: Failed Payment Recovery / Dunning (Weeks 6–8)

**Dev**
- [ ] Listen for `invoice.payment_failed`, store in `FailedPayment`
- [ ] Build configurable retry scheduling (e.g. retry at 1, 3, 7 days)
- [ ] Build recovery email/SMS sequence builder with editable templates
- [ ] Build "recovered revenue" dashboard with real $ totals
- [ ] Add basic A/B testing for subject lines/send times

**Infra/Hosting**
- [ ] Integrate Postmark (email) — set up domain authentication (SPF/DKIM/DMARC) for deliverability
- [ ] Integrate Twilio for SMS recovery messages
- [ ] Set up scheduled jobs (BullMQ/Celery) for retry timing

**Marketing**
- [ ] Build a "recovered revenue" ROI calculator on the landing page (this converts very well for this module)
- [ ] Recruit 5–10 beta users from your waitlist/communities — offer free access in exchange for a testimonial/case study
- [ ] Run a small paid test ($200–300) on Google Ads targeting "stripe failed payment recovery" / "reduce involuntary churn"

---

### Phase 3 — Module 5: Branded Invoices & Receipts (Weeks 9–10)

*This is the simplest module to build — if you want a faster path to your very first paying customer, consider swapping this to Phase 1 instead.*

**Dev**
- [ ] Build invoice template editor (logo, colors, fonts, footer text)
- [ ] Support multi-language/localized templates
- [ ] Map Stripe tax fields into the template correctly
- [ ] Auto-generate + auto-send PDF on `invoice.paid`

**Infra/Hosting**
- [ ] Stand up Puppeteer-based PDF rendering (containerized, or as a Lambda with a Chromium layer)
- [ ] Store generated PDFs in S3, serve via CloudFront

**Marketing**
- [ ] Publish a visual before/after post: "Stripe's default invoice vs. a branded one"
- [ ] Reach out to design-conscious SaaS/agency Slack and Discord communities
- [ ] Open a Product Hunt "coming soon" page to build a launch list

---

### Phase 4 — Module 2: Cancellation Save-Flow (Weeks 11–13)

**Dev**
- [ ] Build embeddable JS widget that intercepts the cancel action
- [ ] Build configurable offer logic (% discount, pause N months, downgrade tier)
- [ ] Track outcomes (saved vs. churned) per offer type
- [ ] Build a "saved MRR" analytics dashboard

**Infra/Hosting**
- [ ] Host the widget script on CDN (CloudFront) for fast load on customer sites
- [ ] Build a lightweight public offer-serving API with rate limiting (this is a customer-facing endpoint, harden it)

**Marketing**
- [ ] Publish your first real case study: "$X saved MRR" from a beta user
- [ ] Record a 90-second demo video for the homepage
- [ ] Pitch to churn/retention-focused newsletters for a mention

---

### Phase 5 — Module 4: Stripe → Accounting Sync (Weeks 14–16)

**Dev**
- [ ] Build QuickBooks and Xero OAuth integrations
- [ ] Build the fee/refund/tax mapping engine (this is the fiddly part — Stripe's fee breakdown is messy)
- [ ] Build scheduled sync jobs + a reconciliation report
- [ ] Build mismatch/error alerts

**Infra/Hosting**
- [ ] Secure OAuth token storage + refresh-token handling
- [ ] Scheduled job runner for nightly syncs

**Marketing**
- [ ] Build a referral program for bookkeepers/accountants (they see this pain across many clients)
- [ ] Guest-post on a bookkeeping/accounting-focused blog
- [ ] Apply for QuickBooks App Store and Xero App Marketplace listings — these marketplaces are a real distribution channel, worth the application overhead

---

### Phase 6 — Module 3: Dispute & Chargeback Evidence Automation (Weeks 17–19)

**Dev**
- [ ] Build dispute webhook listener (`charge.dispute.created`)
- [ ] Build evidence assembly (pull order data, shipping data, support comms)
- [ ] Submit assembled evidence via Stripe's Disputes API
- [ ] Track win/loss rate over time

**Infra/Hosting**
- [ ] Add connectors for shipping data (Shippo/EasyPost) and helpdesk comms (Zendesk/Intercom)

**Marketing**
- [ ] Publish "how to win more Stripe disputes" guide
- [ ] Outreach to Shopify merchant communities/forums (disputes hit ecommerce hardest)
- [ ] Highlight beta win-rate numbers on the module's landing page

---

### Phase 7 — Unified Platform Launch (Weeks 20–22)

**Dev**
- [ ] Unify billing across all modules (à la carte + bundle pricing from Section 3)
- [ ] Polish onboarding flow across modules (one connect-Stripe step unlocks all 6)
- [ ] Cross-module permissions and settings

**Infra/Hosting**
- [ ] Load testing before public launch
- [ ] Security review — pay special attention to anywhere Stripe/Shopify/accounting credentials are stored or transmitted
- [ ] Set up a public status page (e.g. via a simple uptime tool) and backup/disaster-recovery runbook

**Marketing**
- [ ] Launch on Product Hunt and Hacker News ("Show HN")
- [ ] Reach out to SaaS/ecommerce newsletters for launch coverage
- [ ] Launch-week promo: 50% off first 3 months for early signups
- [ ] Apply for listing on the **Stripe Apps marketplace** and **Shopify App Store** — both have direct, high-intent buyer traffic and are arguably your single best acquisition channel once you qualify
- [ ] Kick off an affiliate/referral program

---

### Phase 8 — Post-Launch Growth (ongoing)

**Dev**
- [ ] Build a feedback loop (in-app + interviews) to prioritize the next feature/module
- [ ] Expand integrations based on actual customer requests

**Infra/Hosting**
- [ ] Quarterly cost review and right-sizing of AWS resources as usage grows
- [ ] Add a second region / read replica only once real load justifies it — resist over-engineering early

**Marketing**
- [ ] Maintain 2 SEO posts/month on high-intent terms
- [ ] Publish a new case study every time a customer hits a notable recovered-$ or saved-MRR milestone
- [ ] Explore sponsorships in SaaS/ecommerce podcasts or newsletters once there's revenue to justify it

---

## 5. Marketing Plan (Deep Dive)

### Positioning
Lead every page and pitch with a **dollar number**, not a feature list. "We recovered $4,200 in failed payments last month" sells harder than "automated dunning sequences." Modules 1–3 especially should always show ROI math front and center.

### Highest-leverage channels, in priority order
1. **Stripe Apps marketplace & Shopify App Store** — both platforms have buyers actively searching for exactly this kind of tool. Getting listed (there's a review/approval process) is worth prioritizing once you have a stable module — this is likely your best acquisition channel long-term.
2. **SEO content on high-intent phrases** — devs and founders search exact-match terms like "stripe failed payment recovery," "shopify chargeback automation," "stripe invoice branding." Write for these specifically rather than generic thought-leadership content.
3. **Communities** — Indie Hackers, r/SaaS, r/shopify, r/ecommerce, Stripe's developer community. Build-in-public updates work well here; pure self-promotion does not.
4. **Partnerships/referrals** — bookkeepers and accountants for Module 4; ecommerce agencies for Modules 2/3/5. They see the same pain across many clients and refer in bulk if you set up a simple revenue-share.
5. **Paid ads, narrow and late** — only once you have a proven conversion page with real ROI numbers (post-Phase 2). Target exact-match high-intent keywords, not broad awareness terms — your budget is too small for broad targeting to pay off.
6. **Affiliate/referral program** — launch once you have paying customers, aimed at SaaS/ecommerce newsletter writers and YouTubers who review tools in this space.

### Sales motion
Because the ROI is quantifiable (recovered $, saved MRR), this product can largely **sell itself through self-serve trials** rather than requiring sales calls — fitting your "not sure who yet" / backend-developer profile well. Reserve manual outreach for the accounting-sync and dispute-evidence modules, where a short demo helps because the value is less immediately visible than a recovered-payment dashboard.

---

## 6. Key Risks to Watch

- **Security is the product's biggest liability, not its biggest feature.** You'll be storing other companies' Stripe/Shopify/QuickBooks credentials. Underinvesting here is the one mistake that can end the company — prioritize Secrets Manager, encryption at rest, and RLS before scaling tenant count.
- **Module 1, 2, and 3 have funded, established competitors** (Churn Buster, Churnkey, ProsperStack, etc.). That's validation, not a blocker, but you'll need a clear wedge — likely price, a specific platform focus (e.g. Shopify-only), or the bundle itself, since few competitors offer all 6 modules together.
- **Don't over-build Phase 0.** It's tempting to perfect the multi-tenant core before shipping anything. Cap it at 3 weeks and let real Module 1/6 usage tell you what the core actually needs.

---

*This plan assumes one full-time backend developer. Bringing in a part-time frontend/design contractor around Phase 3–4 would meaningfully speed up the dashboard and widget polish without slowing your backend velocity.*
