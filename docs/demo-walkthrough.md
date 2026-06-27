# Marginly — Demo Walkthrough

## Quick Start (2 minutes to demo-ready)

```bash
cd backend
cp .env.example .env        # fill DATABASE_URL and REDIS_URL at minimum
npm install
npx prisma migrate dev      # creates tables
npx prisma db seed          # loads demo data (Acme Coffee + PixelForge)
npm run dev                 # starts API on :4000

cd ../frontend
npm install
npm run dev                 # starts UI on :5173
```

Open `http://localhost:5173/demo` — no signup required.

---

## Demo Credentials

| Tenant | Email | Password | Plan |
|---|---|---|---|
| Acme Coffee Roasters | demo@acmecoffee.com | DemoPass123! | GROWTH |
| PixelForge Studio | demo@pixelforge.com | DemoPass123! | STARTER |

Both tenants share the same password. Acme Coffee is the fully-seeded showcase tenant with data for all six modules. PixelForge is a minimal tenant used to demonstrate multi-tenancy isolation.

---

## Feature 1: Dunning / Failed Payment Recovery

### What it does

When a Stripe subscription invoice fails, Marginly automatically:

1. Captures the `invoice.payment_failed` webhook and creates a `FailedPayment` record.
2. Schedules a configurable multi-step recovery sequence via BullMQ (Day 1 email, Day 3 email, Day 7 SMS, Day 14 final email).
3. Tracks each `RecoveryAttempt` (channel, sent/opened/paid/bounced).
4. Listens for `invoice.payment_succeeded` and marks the payment `RECOVERED`.

### Seeded data (Acme Coffee)

- 8 failed payments across four statuses: `RECOVERING` (×4), `RECOVERED` (×2), `WRITTEN_OFF` (×1), `PENDING` (×1).
- 1 recovery sequence named "Standard Recovery" with a 4-step config.
- 4 recovery attempts for the two RECOVERED payments showing the email lifecycle.

### What to click

Navigate to **Dunning** in the sidebar. You will see:

- The failed payments table with status badges and retry counters.
- The recovery sequence editor (click "Standard Recovery" to inspect the step config).
- Per-payment detail page showing the attempt timeline.

### Live simulation

```bash
# Create a new RECOVERING payment
POST http://localhost:4000/api/v1/demo/simulate/failed-payment?tenantId=<acme-tenant-id>

# Attach a recovery email attempt to the first RECOVERING payment
POST http://localhost:4000/api/v1/demo/simulate/recovery-email?tenantId=<acme-tenant-id>
```

---

## Feature 2: Cancellation Save-Flow

### What it does

When a customer clicks "Cancel Subscription", Marginly intercepts the action via an embeddable JavaScript widget, presents a targeted retention offer (discount, pause, or plan downgrade), and records whether the customer was saved or churned.

### Widget embed

```html
<script src="https://app.usemarginly.com/widget.js" data-key="YOUR_PUBLIC_KEY"></script>
```

The widget attaches to the cancel button automatically. On click it calls `POST /widget/offer` with an HMAC-signed token identifying the customer. The returned `SaveOffer` is rendered in a modal.

### Seeded data (Acme Coffee)

- 3 active `SaveOffer`s: 20% off for 3 months (DISCOUNT), pause for 1 month (PAUSE), switch to Starter plan (DOWNGRADE).
- 15 `CancellationAttempt`s spread over the last 30 days: 9 SAVED, 5 CHURNED, 1 PENDING.

### What to click

Navigate to **Save-Flow** in the sidebar. You will see:

- A funnel chart: offers presented vs accepted vs churned.
- The offers management table with configurable offer parameters.
- A demo cancel button that triggers the widget modal inline.

---

## Feature 3: Dispute Evidence Automation

### What it does

When a chargeback is filed, Marginly:

1. Captures `charge.dispute.created` and creates a `Dispute` record with the evidence due date.
2. Automatically assembles an `EvidenceBundle` by pulling order data, shipping confirmation, and customer email history.
3. Submits the bundle to the Stripe Disputes API before the deadline.
4. Listens for `charge.dispute.closed` and updates the status to `WON` or `LOST`.

### Seeded data (Acme Coffee)

- 4 disputes across all four statuses: OPEN (due in 3 days), UNDER_REVIEW, WON, LOST.
- 1 pre-assembled `EvidenceBundle` on the UNDER_REVIEW dispute, containing order data, USPS tracking, and a customer email log.

### What to click

Navigate to **Disputes** in the sidebar. You will see:

- A summary card showing the win rate.
- The disputes table with a countdown timer for the OPEN dispute.
- Click the UNDER_REVIEW row to inspect the auto-assembled evidence bundle fields.
- Click "Submit Evidence" to see the Stripe API call flow (dry-run in demo mode).

### Live simulation

```bash
# Mark the first OPEN dispute as WON (writes to DB, returns updated dispute + stats)
POST http://localhost:4000/api/v1/demo/simulate/dispute-won?tenantId=<acme-tenant-id>
```

---

## Feature 4: Stripe to Accounting Sync

### What it does

Marginly connects to QuickBooks Online (or Xero) via OAuth and automatically maps Stripe charges to accounting entries. It refreshes tokens silently and alerts on mapping failures.

### Seeded data (Acme Coffee)

- 1 `AccountingConnection` for QuickBooks with a token that expires 25 minutes after seeding — this demonstrates the token refresh banner in the UI.
- 12 `SyncedTransaction`s: 9 SYNCED (with QB entry IDs), 2 FAILED (account mapping error), 1 PENDING.

### What to click

Navigate to **Accounting Sync** in the sidebar. You will see:

- A connection status card showing the QB connection and token expiry countdown.
- The transaction sync table with status badges and error messages on the FAILED rows.
- Click "Retry Failed" to re-queue the FAILED transactions.
- Click "Sync Now" to trigger a manual sync of the PENDING transaction.

### Live simulation

```bash
# Mark the PENDING transaction as SYNCED with entry ID QB-ENTRY-DEMO
POST http://localhost:4000/api/v1/demo/simulate/accounting-sync?tenantId=<acme-tenant-id>
```

---

## Feature 5: Branded Invoices

### What it does

Marginly generates white-labelled PDF invoices for every Stripe invoice, applying the merchant's brand colors, logo, and tax settings. PDFs are stored in S3 and served via signed URLs.

### Seeded data (Acme Coffee)

- 1 default `InvoiceTemplate` with Acme Coffee branding: coffee-brown primary color (`#6F4E37`), gold accent (`#D4A373`), US locale, 8.75% sales tax.
- 5 `GeneratedInvoice` records with S3 key paths.

### What to click

Navigate to **Branded Invoices** in the sidebar. You will see:

- A template editor with live preview of the brand fields.
- The invoice list with download links (in demo mode, the signed URL points to the placeholder PDF).
- Toggle the "Before / After" comparison to see the difference between a raw Stripe invoice and the branded version.
- Adjust primary color and watch the preview update in real time.

---

## Feature 6: Webhook Monitoring

### What it does

Marginly captures every inbound webhook from Stripe and Shopify, stores it in `WebhookEvent`, and processes it via BullMQ. Failed events are moved to a dead-letter queue, trigger alert rules, and can be replayed in one click.

### Seeded data (Acme Coffee)

- 20 webhook events spread over the last 7 days:
  - 14 PROCESSED (mix of event types from both providers)
  - 4 FAILED (timeout error)
  - 1 RECEIVED (just arrived, not yet processed)
  - 1 REPLAYED (manually retried)
- 2 `AlertRule`s: one Slack rule on any single failure, one email rule on a 10% failure-rate window.

### What to click

Navigate to **Webhook Monitor** in the sidebar. You will see:

- An event log with provider badges, event types, and status indicators.
- Click a FAILED event row to expand the error message and payload inspector.
- Click "Replay" on a FAILED event to re-queue it (status transitions to REPLAYED then PROCESSED).
- Navigate to **Alert Rules** sub-tab to see the configured Slack and email rules.

### Live simulation

```bash
# Inject a new FAILED webhook event (simulates a downstream timeout)
POST http://localhost:4000/api/v1/demo/simulate/webhook-failure?tenantId=<acme-tenant-id>
```

---

## Multi-Tenancy Isolation Demo

Log in as `demo@pixelforge.com` (password: `DemoPass123!`). PixelForge Studio has:

- 3 pending failed payments (amounts: $19, $29, $49)
- 5 processed webhook events
- 1 open dispute

You will NOT see any Acme Coffee data. Every database table is scoped by `tenant_id`. Postgres Row-Level Security policies enforce this at the database layer, so even a misconfigured query cannot leak cross-tenant rows.

To verify isolation, note that the failed payment IDs, dispute IDs, and webhook event IDs listed in the PixelForge rows are entirely disjoint from those seeded for Acme Coffee.

---

## API Reference for Demo Endpoints

All demo endpoints are public (no JWT required) and return `503 Service Unavailable` in `NODE_ENV=production`.

### Reset demo data

```
POST /api/v1/demo/reset
```

Response:

```json
{
  "message": "Demo data reset successfully",
  "tenantId": "<uuid>",
  "loginEmail": "demo@acmecoffee.com",
  "loginPassword": "DemoPass123!"
}
```

### Get scenario description

```
GET /api/v1/demo/scenario/:name
```

Valid names: `failed-payment` | `cancellation` | `dispute` | `webhook-failure`

Response: JSON object with `title`, `description`, and `steps` array.

### Run a live simulation

```
POST /api/v1/demo/simulate/:scenario?tenantId=<uuid>
```

Valid scenarios:

| Scenario | What it writes |
|---|---|
| `failed-payment` | Creates a new `FailedPayment` with status `RECOVERING` |
| `recovery-email` | Creates a `RecoveryAttempt` (EMAIL, SENT) on the first RECOVERING payment |
| `dispute-won` | Updates first OPEN `Dispute` to `WON`, returns updated stats |
| `accounting-sync` | Updates first PENDING `SyncedTransaction` to `SYNCED` |
| `webhook-failure` | Creates a new `WebhookEvent` with status `FAILED` |

---

## Resetting Demo Data

If the demo data becomes stale or you want a fresh state:

```bash
# Via HTTP
curl -X POST http://localhost:4000/api/v1/demo/reset

# Or re-run the seed directly (idempotent — safe to run multiple times)
cd backend
npx prisma db seed
```

The `/demo/reset` endpoint performs a targeted delete of the two demo tenants (identified by their Stripe customer IDs `cus_demo_acme` and `cus_demo_pixel`) and then recreates them from scratch. Cascade deletes on all child tables clean up all related rows automatically.

---

## Rules and Constraints

- `seed.ts` uses real bcrypt at cost factor 12. Passwords are never stored in plain text.
- All demo data uses Stripe test-mode IDs (`in_test_*`, `ch_test_*`, `evt_test_*`).
- `seed.ts` is fully idempotent. Running it twice will not create duplicate rows.
- `DemoService.simulate()` writes real rows to the database — it does not return mock data.
- All demo routes throw `503 ServiceUnavailableException` when `NODE_ENV=production`.
- Encrypted credentials in demo rows use the `demo:` prefix. The KMS service checks for this prefix in dev/test mode and skips actual decryption.
