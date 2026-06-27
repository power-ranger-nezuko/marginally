# Pricing Strategy & Competitive Analysis — Merchant Revenue Toolkit ("Marginly")

*Researched June 2026. SaaS pricing changes often — treat the figures below as
directional, and re-check vendor sites before quoting them to a customer.*

---

## 1. Competitor Pricing by Module

| Module | Direct competitor | Pricing model (as published) |
|---|---|---|
| **1. Dunning** | Churn Buster | No public tiers; starts around $99/mo per third-party trackers, scales with MRR/recovered revenue, sales-assisted (per churnbuster.io/pricing) |
| | Churnkey | Official site: starts at $250/mo; third-party trackers report tiers from ~$199–$990/mo depending on churn volume, plus some plans bill a % of recovered revenue (per churnkey.co/pricing) |
| **2. Cancellation Save-Flow** | Churnkey | Same as above — same product covers both dunning and save-flows |
| | ProsperStack | Grow $200/mo, Prosper $750/mo, Enterprise custom — tiered by monthly cancellation-session volume (50–500, 500+, unlimited) (per softwarefinder.com/ProsperStack) |
| **3. Dispute/Chargeback Evidence** | Chargeflow | Success-fee model: 25% of each chargeback successfully recovered, $0 if not recovered; separate Alerts product priced per scanned/prevented transaction (per chargeflow.io/pricing) |
| **4. Stripe → Accounting Sync** | Synder | Basic ~$52–65/mo (annual billing, ~500 transactions), Essential ~$92/mo, Pro ~$220/mo — tiered by monthly transaction volume (per Capterra/Synder pricing pages) |
| | Acodei (lighter alternative) | Starts at $12/mo for 100 transactions — Stripe-only, no revenue recognition (per acodei.com) |
| **5. Branded Invoices** | Sufio (Shopify) | Starts around $7/mo, multiple tiers up to "Plus" for Shopify Plus brands (per sufio.com/pricing) |
| **6. Webhook Monitoring** | Hookdeck | Free tier (100K events/mo), Team ~$39/mo + $0.33/100K events, Growth $499/mo, Enterprise custom (per hookdeck.com/pricing) |

**What this tells us:**
- Modules 1–3 (dunning, save-flow, disputes) are priced as **high-value, sales-assisted retention tools** ($200–$990/mo, or 15–25% success fees) aimed at companies already losing meaningful revenue.
- Modules 4–6 (accounting sync, invoices, webhooks) are priced as **cheap, self-serve utilities** ($7–$220/mo), bought without a sales conversation.
- **No competitor bundles all 6.** A merchant assembling the equivalent stack today (Churnkey + Chargeflow + Synder + Sufio + Hookdeck) could easily pay $400–$1,000+/month across five separate vendors, five separate logins, and five separate onboarding flows.

This gap — one platform, one bill, one onboarding — is the wedge, not just being cheaper module-by-module.

---

## 2. Our Cost Structure (COGS)

Estimated monthly AWS + third-party infra cost at three growth stages
(architecture per `project-plan.md` Section 2). These are planning estimates,
not vendor quotes — validate against actual AWS billing once running.

| Cost item | Early (~20 tenants) | Growth (~100 tenants) | Scale (~500 tenants) |
|---|---|---|---|
| RDS Postgres | $25 | $150 | $500 |
| ElastiCache Redis | $13 | $50 | $150 |
| ECS Fargate (app/workers) | $30 | $150 | $500 |
| S3 + CloudFront | $5 | $30 | $100 |
| Postmark (transactional email) | $15 | $90 | $375 |
| Twilio (SMS) | $10 | $50 | $200 |
| Secrets Manager | $10 | $50 | $200 |
| Route53 / misc / CloudWatch | $25 | $50 | $150 |
| **Total monthly infra cost** | **~$133** | **~$570** | **~$2,175** |
| **Cost per tenant** | **~$6.65** | **~$5.70** | **~$4.35** |

Two things worth noting:
- **Cost per tenant goes down as you scale** — typical of multi-tenant SaaS, since fixed infra (DB, cache, base compute) is shared across a growing tenant count.
- This excludes your own time. There are no per-seat or per-API-call charges from Stripe/Shopify/QuickBooks/Xero for the read access this product needs — the infra above is essentially the whole COGS line.

---

## 3. Recommended Pricing Model

À la carte modules + a discounted full-suite bundle, undercutting the
direct-competitor entry price on every module while preserving very high
gross margin given the COGS above.

| Module | Marginly price | Cheapest comparable competitor entry price | Positioning |
|---|---|---|---|
| Dunning | $49/mo (Starter) → $149/mo (Growth, higher MRR) | Churn Buster ~$99/mo | Roughly half the entry price |
| Cancellation Save-Flow | $59/mo → $179/mo | ProsperStack $200/mo | ~70% cheaper to start |
| Dispute Evidence | $0/mo + 15% of recovered chargeback (or $79/mo flat for >20 disputes/mo) | Chargeflow 25% success fee | Lower success-fee %, flat option for high-volume merchants |
| Accounting Sync | $29/mo → $89/mo | Synder ~$52–65/mo entry | Cheaper entry, fewer transaction-tier surprises |
| Branded Invoices | $15/mo → $39/mo | Sufio ~$7/mo entry (Shopify-only) | Slightly higher, but multi-platform (not Shopify-only) |
| Webhook Monitor | Free (up to 50K events/mo) → $39/mo | Hookdeck free tier 100K events | Loss-leader: drives adoption, upsells into other modules |
| **Full Suite bundle** | **$249/mo** (or **$2,490/yr**, ~2 months free) | *N/A — no competitor offers all 6* | Replaces $400–$1,000+/mo of separate tools |

**Why this is defensible, not just "cheap":**
- At the Early-stage COGS of ~$6.65/tenant, even the $49/mo Dunning-only plan carries an ~86% gross margin.
- The Full Suite bundle at $249/mo against ~$5–7/tenant COGS is a ~97%+ gross margin — there's room to discount for annual plans, run promos, and pay affiliate commissions without threatening unit economics.
- Free tier on Webhook Monitor is a deliberate loss-leader: it's the cheapest module to run, the easiest to self-serve adopt, and the most natural place to introduce a merchant to the rest of the suite.

---

## 4. Adoption Strategy

**Funnel assumptions** (used in the projections below, based on typical
self-serve B2B SaaS devtool benchmarks — your actual numbers will move once
you have real data, treat these as a planning baseline, not a guarantee):

| Assumption | Value |
|---|---|
| Trial → paid conversion rate | 20% (base case) |
| Monthly logo churn | 5% (base case) |
| Starting trial signups/month | 15 (month 1, mostly from the Phase 0 waitlist + beta users) |
| Trial signups/month by month 24 | 150 (driven by SEO + marketplace listings compounding) |
| Average revenue per account (ARPA) | starts ~$60/mo (single module), grows to ~$95/mo as bundle adoption increases |

**Acquisition cost by channel (rough, directional):**
- Marketplace listings, SEO, and community participation: near-$0 cash cost (time investment only) — this is why they're prioritized first in the marketing plan.
- Paid ads (started only after Phase 2): estimate $80–150 cost per paying customer at small scale, typical for narrow B2B SaaS keyword campaigns.
- Blended CAC, once content/marketplace traffic dominates the mix (~month 9+): likely **$20–60 per paying customer** — well under the ~$600+ first-year revenue of even a single-module customer.

---

## 5. 24-Month Adoption & Revenue Projections

Modeled month-by-month using the funnel assumptions above (linear ramp in
trial volume and ARPA, compounding monthly churn). Three scenarios shown;
**Base is the planning case**, Conservative and Optimistic bound the range.

### Base case (quarterly checkpoints)

| Month | Active paying customers | ARPA | MRR | ARR (annualized) |
|---|---|---|---|---|
| 3 | 12 | $63 | $758 | $9,100 |
| 6 | 32 | $68 | $2,189 | $26,300 |
| 9 | 60 | $72 | $4,321 | $51,800 |
| 12 | 94 | $77 | $7,174 | $86,100 |
| 15 | 132 | $81 | $10,761 | $129,100 |
| 18 | 176 | $86 | $15,090 | $181,100 |
| 21 | 223 | $90 | $20,163 | $241,900 |
| 24 | 274 | $95 | $25,983 | **$311,800** |

### Conservative case (lower conversion 12%, higher churn 7%, slower trial growth)

| Month | Active customers | MRR | ARR |
|---|---|---|---|
| 12 | 25 | $1,617 | $19,400 |
| 24 | 68 | $5,083 | $61,000 |

### Optimistic case (higher conversion 25%, lower churn 4%, faster trial growth via strong marketplace traction)

| Month | Active customers | MRR | ARR |
|---|---|---|---|
| 12 | 202 | $17,497 | $210,000 |
| 24 | 610 | $67,131 | $805,600 |

**Read on this range:** the gap between Conservative and Optimistic at month
24 (roughly $61K to $806K ARR) is mostly driven by one variable — how well the
marketplace-listing and SEO flywheel compounds. That's the single highest-leverage
thing to get right operationally, more than any pricing tweak.

---

## 6. Margin & Break-Even Check

Pairing the Base-case revenue with the COGS table from Section 2:

| Month | Customers | MRR | Infra COGS (interpolated) | Gross margin |
|---|---|---|---|---|
| 9 | 60 | $4,321 | ~$330 | ~92% |
| 12 | 94 | $7,174 | ~$540 | ~92% |
| 24 | 274 | $25,983 | ~$1,400 | ~95% |

Gross margin stays above 90% throughout the Base-case ramp — infra cost is
never the constraint. The real break-even question is when MRR covers your
own living expenses as founder, which is a number only you can size, but
month 9–12 of the Base case (~$4,300–$7,200 MRR) is a reasonable point to
plan around for "this covers a modest founder salary," and month 18–24
(~$15,000–$26,000 MRR) for "this supports bringing on a part-time hire."

---

## 7. Caveats

- These projections assume execution roughly matching the marketing plan's
  channel mix (marketplace listings live by month 6–9, consistent content
  cadence, at least 2 case studies before launch). Slower execution on any of
  those shifts the curve toward Conservative.
- Competitor pricing was pulled from public pricing pages and third-party
  trackers in June 2026 and is known to change; several competitors (Churn
  Buster, Churnkey) gate their real enterprise pricing behind a sales call,
  so the published figures above are entry points, not full price ranges.
- Success-fee pricing (Module 3) introduces revenue volatility tied to
  dispute volume — model it separately from flat-fee MRR if you need precise
  cash-flow planning.
