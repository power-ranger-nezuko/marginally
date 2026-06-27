# Marketing Plan — Merchant Revenue Toolkit ("Marginly")

This expands Section 5 of `project-plan.md` into a standalone plan: positioning,
target buyer, channel-by-channel tactics, a sample content calendar, and a
launch checklist.

---

## 1. Positioning

**Core message:** lead with a dollar number, not a feature list. Every module
should be sellable with a sentence like *"we recovered/saved/won $X for
merchants like you last month."*

**Tagline candidates:**
- "Stripe and Shopify tell you what happened to your money. Marginly stops you from losing it."
- "Six leaks in your revenue. One dashboard to plug them all."
- "Replace six subscriptions with one."

**Per-module one-liners** (use on module-specific landing pages):
| Module | One-liner |
|---|---|
| Dunning | "Stop losing customers to expired cards and declined charges." |
| Cancellation Save-Flow | "Give every canceling customer one more reason to stay." |
| Dispute Evidence | "Never miss a chargeback deadline again." |
| Accounting Sync | "Your books and your Stripe balance, finally in agreement." |
| Branded Invoices | "Invoices that look like your brand, not Stripe's." |
| Webhook Monitor | "Know the second a webhook fails — not when a customer tells you." |

---

## 2. Target Customer Profile

**Primary ICP:** subscription SaaS or ecommerce brands doing roughly
$10K–$500K/month through Stripe or Shopify, without a dedicated RevOps or
finance hire yet.

**Buyer personas:**
- **Founder/CEO** (pre-$50K MRR): buys directly, self-serve, price-sensitive, wants fastest ROI module first (Dunning, Branded Invoices).
- **Head of Growth / RevOps** ($50K–$500K MRR): evaluates Cancellation Save-Flow and Dispute Evidence with an ROI calculator before buying.
- **Bookkeeper / Accountant** (referral channel): recommends Accounting Sync to multiple clients; needs a partner/referral program, not a direct sales pitch.

---

## 3. Channel Plan

### 3.1 Marketplace listings (highest-leverage channel)
Apply for listing on:
- **Stripe App Marketplace**
- **Shopify App Store**
- **QuickBooks App Store** and **Xero App Marketplace** (for the Accounting Sync module)

These have built-in, high-intent buyer traffic — merchants actively searching
for exactly this kind of tool. Application/review timelines run several weeks,
so apply as soon as each module is stable, not after full-suite launch.

### 3.2 SEO content
Target exact-match, high-intent search phrases. Cadence: 2 posts/month once
live, ramping to weekly after month 6.

### 3.3 Communities
Participate authentically (build-in-public updates, not pure self-promotion) in:
Indie Hackers, r/SaaS, r/shopify, r/ecommerce, r/QuickBooks, Stripe's developer
community/Discord.

### 3.4 Partnerships & referrals
- Bookkeepers/accountants → Accounting Sync module. Offer 20% recurring
  commission for referred customers who stay 3+ months.
- Ecommerce agencies → Cancellation Save-Flow and Dispute Evidence modules,
  since agencies manage churn/disputes for multiple merchant clients.

### 3.5 Paid ads (late, narrow)
Only start once a module has a converting landing page with a real ROI
calculator (post Phase 2 of the project plan). Target exact-match keywords
like "stripe failed payment recovery," not broad awareness terms — budget is
too small for broad targeting to pay off.

### 3.6 Affiliate program
Launch once there are 10+ paying customers. 20% recurring commission, first
12 months, for SaaS/ecommerce newsletter writers and YouTubers reviewing
tools in this space.

### 3.7 Founder-led outreach
Reserve for the Accounting Sync and Dispute Evidence modules, where the value
is less immediately visible than a recovered-payment dashboard and a short
demo materially helps close the sale.

---

## 4. Sample Content Calendar (first 6 months)

| Month | Topic | Module | Funnel stage |
|---|---|---|---|
| 1 | "How to catch silent Stripe webhook failures before they cost you money" | Webhook Monitor | Awareness |
| 1 | "Stripe Smart Retries vs. a dedicated dunning tool: when you need more" | Dunning | Consideration |
| 2 | "The real cost of a failed payment (and how to calculate your recoverable revenue)" | Dunning | Consideration |
| 2 | "Stripe's default invoice vs. a branded one" (visual before/after) | Branded Invoices | Awareness |
| 3 | "How to win more Stripe disputes: an evidence checklist" | Dispute Evidence | Consideration |
| 3 | "Why your Stripe balance never matches your QuickBooks books" | Accounting Sync | Awareness |
| 4 | "Cancellation flows that actually save customers (with examples)" | Save-Flow | Consideration |
| 4 | "Involuntary vs. voluntary churn: which one is actually costing you more" | Dunning + Save-Flow | Awareness |
| 5 | "A founder's guide to chargeback evidence deadlines" | Dispute Evidence | Decision |
| 5 | "Multi-currency invoicing for Stripe businesses selling internationally" | Branded Invoices | Decision |
| 6 | Case study: first beta customer's recovered-revenue numbers | Dunning | Decision |
| 6 | Case study: first beta customer's saved-MRR numbers | Save-Flow | Decision |

---

## 5. Launch Sequence Checklist (Phase 7 of the project plan)

- [ ] Product Hunt launch page prepared 2 weeks in advance, with a "coming soon" waitlist running beforehand
- [ ] "Show HN" post drafted — lead with the problem and the dollar-recovered number, not the tech stack
- [ ] Outreach list of 10–15 SaaS/ecommerce newsletters prepared with a short pitch + screenshot
- [ ] Launch-week promo live (e.g. 50% off first 3 months)
- [ ] Marketplace listings submitted (Stripe Apps, Shopify App Store at minimum)
- [ ] Affiliate program page live
- [ ] At least 2 case studies/testimonials ready (from beta users) before launch day — launching with zero social proof is the most common avoidable mistake

---

## 6. KPIs to Track

| Metric | Why it matters |
|---|---|
| Trial signups / month | Top-of-funnel health |
| Trial → paid conversion rate | Onboarding/ROI-clarity quality |
| Monthly logo churn | Whether the product holds value over time |
| Modules per account | Cross-sell/bundle success |
| CAC by channel | Where to reinvest marketing time/budget |
| MRR by module | Which module to prioritize for further investment |

See `pricing-strategy.md` for how these KPIs feed into the adoption and
revenue projections.
