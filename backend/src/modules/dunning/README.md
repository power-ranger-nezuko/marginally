# Module 1: Dunning / Failed Payment Recovery
Listens for invoice.payment_failed, retries on a configurable schedule,
sends recovery email/SMS sequences, tracks recovered revenue.
Tables: FailedPayment, RecoverySequence, RecoveryAttempt.
See docs/project-plan.md → Phase 2.
