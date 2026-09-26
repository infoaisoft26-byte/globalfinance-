# GLOBAL FINANCE Deployment

## 1. PostgreSQL

Use PostgreSQL 16+ from a managed provider or the included Docker Compose stack.

Local/self-hosted database:

```bash
POSTGRES_PASSWORD='use-a-strong-secret' docker compose up -d postgres
export DATABASE_URL='postgres://global_finance:use-a-strong-secret@127.0.0.1:5432/global_finance'
npm run db:migrate
```

For managed PostgreSQL, set the provider-issued `DATABASE_URL` in the application environment and run `npm run db:migrate` once per deployment when schema changes are introduced.

Do not expose port 5432 publicly. Restrict database network access to the application/runtime and administrative maintenance sources.

## 2. Application secrets

Set all values shown in `.env.example`. Generate `AUTH_SECRET` from at least 32 cryptographically random bytes. Keep `PAYMENTS_ENABLED=false` and `PAYOUTS_ENABLED=false` until an authorized provider and required compliance controls are configured.

## 3. Create the first admin

After migration, temporarily set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME`, then run:

```bash
npm run admin:create
```

Remove the bootstrap password variables from the deployment environment after the admin has been created. The bootstrap action is written to the immutable audit log.

## 4. Private KYC storage

Create a private S3-compatible bucket. Public object access must remain disabled. Configure the `KYC_STORAGE_*` environment variables. User uploads use a five-minute signed PUT URL and admin document viewing uses a two-minute signed GET URL. Document access is audited.

Configure bucket CORS to permit PUT from the exact production web origin only. Limit accepted upload types to PDF/JPEG/PNG/WebP and keep provider-side encryption enabled.

## 5. Production application deployment

Install dependencies, typecheck, build, migrate the database, then start the application:

```bash
npm ci
npm run typecheck
npm run build
npm run db:migrate
npm start
```

For Vercel or another serverless platform, configure `DATABASE_URL`, `AUTH_SECRET`, storage credentials and the application URL in the project environment. Use a PostgreSQL provider that supports the expected serverless connection pattern or pooling. Do not run the migration command from every request/runtime instance; run it as a controlled deployment step.

## 6. Security baseline

- Enforce HTTPS in production.
- Keep PostgreSQL and KYC object storage private.
- Rotate application/database/storage secrets periodically.
- Never directly edit wallet balances; balances are derived from ledger entries.
- Ledger and audit tables are append-only at the database layer.
- Admin account suspension and KYC changes are audited.
- Real payment/payout execution remains provider-gated and disabled by default.
- Add backups, restore testing, rate limiting, alerting, CSP/security headers and provider webhooks before handling real customer funds.
