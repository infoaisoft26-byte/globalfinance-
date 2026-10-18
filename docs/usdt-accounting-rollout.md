# USDT accounting rollout

## Safety rules
- Use PostgreSQL NUMERIC for ledger calculations and display USDT to six decimal places.
- Never guess an INR/USDT conversion rate. Record the verified rate, source, effective timestamp, and approving administrator.
- Preserve the original INR ledger as historical evidence. Conversion creates separate USDT opening entries and never edits or deletes historical records.
- Keep payouts disabled until accounting reconciliation and payment-provider controls are independently verified.
- Referral credits remain disabled until an administrator configures a written policy: eligible event, commission base/rate, caps, reversals, and anti-self-referral rules. Each credit must identify sponsor, referred member, and source transaction.
- Do not credit ROI unless the governing plan and applicable legal/compliance review authorize it.

## Rollout
1. Back up the production database and review `db/migrations/20261018_usdt_accounting.sql`.
2. Apply the additive SQL migration to the correct PostgreSQL database.
3. Set `INR_PER_USDT`, `INR_USDT_RATE_SOURCE`, and `INR_USDT_RATE_AS_OF` only after independently verifying the conversion rate.
4. Run `node scripts/migrate-inr-to-usdt.mjs` first. Default mode is read-only dry run.
5. Review all wallet totals and exceptions. To apply, also set `USDT_MIGRATION_APPROVED=true`, `USDT_MIGRATION_APPROVED_BY` (admin UUID), and `USDT_MIGRATION_NOTES`, then run with `--apply`.
6. The conversion writes opening balances to the separate USDT ledger and records reconciliation as pending; it does not mark the migration verified or enable payouts.
7. Update all app APIs and user/admin pages to read and write the USDT ledger, then reconcile totals before enabling payouts.

## Integration blocker found
The repository currently has a database adapter mismatch: `lib/db.ts` exports a Firebase Admin Firestore object, while existing dashboard/admin pages call PostgreSQL-style `db.query(...)`; `db/schema.sql` defines PostgreSQL tables. Resolve and test this connection before running migrations or claiming the live site is updated.
