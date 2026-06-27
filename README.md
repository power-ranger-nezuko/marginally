# Merchant Revenue Toolkit ("Marginly")

Multi-tenant SaaS platform combining 6 Stripe/Shopify add-on modules:
dunning, cancellation save-flow, dispute evidence automation, accounting sync,
branded invoices, and webhook monitoring.

See **[docs/project-plan.md](docs/project-plan.md)** for the full architecture,
phased build plan, marketing plan, and hosting steps. Start there.

## Layout

```
merchant-toolkit/
├── docs/
│   └── project-plan.md       ← the full plan: architecture, phases, marketing, hosting
├── backend/                   ← API server (Node/NestJS or Python/FastAPI — pick one)
│   └── src/
│       ├── core/               shared multi-tenant infrastructure
│       │   ├── tenant/         tenant CRUD, tenant context middleware
│       │   ├── auth/           login, signup, JWT/session, RBAC
│       │   ├── connections/    Stripe/Shopify/QuickBooks OAuth + encrypted credential storage
│       │   └── audit-log/      who-did-what tracking across all modules
│       └── modules/            one folder per sellable module (see below)
│           ├── dunning/
│           ├── cancellation-saveflow/
│           ├── dispute-evidence/
│           ├── accounting-sync/
│           ├── branded-invoices/
│           └── webhook-monitor/
├── frontend/                  ← dashboard (React + Tailwind)
│   └── src/
│       ├── pages/
│       └── components/
└── infra/                     ← hosting/deployment
    ├── terraform/             infrastructure-as-code (RDS, Redis, S3, ECS, etc.)
    └── scripts/               deploy scripts, migration runners, etc.
```

## Suggested build order

Per the project plan, build in this order so each module reuses the last:

1. `core/` (tenant, auth, connections) — everything else depends on this
2. `modules/webhook-monitor` — shared ingestion pipeline other modules will reuse
3. `modules/dunning` — fastest path to a "we recovered $X" sales pitch
4. `modules/branded-invoices` — simplest module; swap to position #1 if you want a faster first paying customer
5. `modules/cancellation-saveflow`
6. `modules/accounting-sync`
7. `modules/dispute-evidence`

## Getting started

```bash
# backend
cd backend
cp .env.example .env   # fill in DB, Redis, Stripe, Postmark/Twilio credentials
npm install            # or: pip install -r requirements.txt
npm run dev

# frontend
cd frontend
npm install
npm run dev
```

## Multi-tenancy rule of thumb

Every table in every module carries a `tenant_id`. Every query must be scoped
by it. Start with app-layer filtering; add Postgres Row-Level Security before
any real customer financial data goes live (see docs/project-plan.md, Section 2).
