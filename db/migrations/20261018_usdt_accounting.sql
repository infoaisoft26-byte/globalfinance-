-- Additive USDT ledger foundation; historical INR records remain unchanged.
BEGIN;
CREATE TABLE IF NOT EXISTS usdt_ledger_transactions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), reference TEXT UNIQUE NOT NULL,
 transaction_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('pending','posted','reversed','failed')),
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS usdt_ledger_entries (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id UUID NOT NULL REFERENCES usdt_ledger_transactions(id) ON DELETE RESTRICT,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, wallet_type TEXT NOT NULL CHECK(wallet_type IN ('fund','income')),
 entry_type TEXT NOT NULL CHECK(entry_type IN ('opening_conversion','deposit','investment','roi_income','referral_income','level_income','withdrawal','fee','adjustment')),
 direction TEXT NOT NULL CHECK(direction IN ('debit','credit')), amount_usdt NUMERIC(30,6) NOT NULL CHECK(amount_usdt>0),
 source_user_id UUID REFERENCES users(id), source_transaction_ref TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usdt_entries_user_created ON usdt_ledger_entries(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usdt_entries_type ON usdt_ledger_entries(entry_type,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usdt_entries_source_user ON usdt_ledger_entries(source_user_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usdt_entries_source_once ON usdt_ledger_entries(user_id,wallet_type,entry_type,source_transaction_ref) WHERE source_transaction_ref IS NOT NULL;
CREATE TABLE IF NOT EXISTS currency_migration_reconciliations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), migration_key TEXT UNIQUE NOT NULL,
 inr_per_usdt NUMERIC(20,8) NOT NULL CHECK(inr_per_usdt>0), rate_source TEXT NOT NULL, rate_as_of TIMESTAMPTZ NOT NULL,
 approved_by UUID NOT NULL REFERENCES users(id), source_inr_total NUMERIC(30,2) NOT NULL,
 converted_usdt_total NUMERIC(30,6) NOT NULL, wallet_count INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','verified','rejected')), verified_by UUID REFERENCES users(id),
 verified_at TIMESTAMPTZ, notes TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS finance_policy_settings (
 setting_key TEXT PRIMARY KEY, setting_value JSONB NOT NULL, updated_by UUID REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO finance_policy_settings(setting_key,setting_value) VALUES
 ('currency','{"primary":"USDT","display_decimals":6}'::jsonb),
 ('payouts','{"enabled":false,"requires_accounting_verified":true}'::jsonb),
 ('referral','{"enabled":false,"commission_rate":null,"requires_admin_policy":true}'::jsonb)
ON CONFLICT(setting_key) DO NOTHING;
CREATE OR REPLACE FUNCTION prevent_usdt_ledger_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'USDT ledger records are immutable; post a reversing entry instead'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS usdt_transactions_no_update ON usdt_ledger_transactions;
CREATE TRIGGER usdt_transactions_no_update BEFORE UPDATE OR DELETE ON usdt_ledger_transactions FOR EACH ROW EXECUTE FUNCTION prevent_usdt_ledger_mutation();
DROP TRIGGER IF EXISTS usdt_entries_no_update ON usdt_ledger_entries;
CREATE TRIGGER usdt_entries_no_update BEFORE UPDATE OR DELETE ON usdt_ledger_entries FOR EACH ROW EXECUTE FUNCTION prevent_usdt_ledger_mutation();
COMMIT;
