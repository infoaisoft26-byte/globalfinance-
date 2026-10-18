CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  mobile_number TEXT,
  referral_code TEXT UNIQUE NOT NULL CHECK (referral_code ~ '^GF[0-9]{6}$'),
  referred_by UUID REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','suspended','closed')),
  kyc_status TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending','in_review','verified','rejected')),
  kyc_reviewed_by UUID REFERENCES users(id),
  kyc_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mobile_number ON users(mobile_number) WHERE mobile_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('fund','income')),
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, wallet_type, currency)
);

ALTER TABLE wallets ALTER COLUMN currency TYPE VARCHAR(8);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  transaction_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('pending','posted','reversed','failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  package_type TEXT NOT NULL CHECK (package_type IN ('basic','fd')),
  active BOOLEAN NOT NULL DEFAULT false,
  terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS package_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  package_id UUID NOT NULL REFERENCES packages(id),
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','matured','cancelled')),
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('pan','aadhaar','passport','driving_license','other')),
  document_last4 TEXT,
  document_storage_key TEXT NOT NULL,
  address_storage_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_review','verified','rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT
);

CREATE TABLE IF NOT EXISTS usdt_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tx_hash TEXT UNIQUE NOT NULL CHECK (tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount_base_units BIGINT NOT NULL CHECK (amount_base_units > 0),
  block_number BIGINT NOT NULL CHECK (block_number > 0),
  confirmations BIGINT NOT NULL CHECK (confirmations >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usdt_deposits_user ON usdt_deposits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usdt_deposits_status ON usdt_deposits(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usdt_deposits_tx ON usdt_deposits(tx_hash);

CREATE INDEX IF NOT EXISTS idx_kyc_submissions_status ON kyc_submissions(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_user ON kyc_submissions(user_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_admin_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON support_ticket_messages(ticket_id, created_at ASC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE OR REPLACE FUNCTION prevent_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger records are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_transactions_no_update ON ledger_transactions;
CREATE TRIGGER ledger_transactions_no_update
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

DROP TRIGGER IF EXISTS ledger_entries_no_update ON ledger_entries;
CREATE TRIGGER ledger_entries_no_update
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit records are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();


-- Investment-cycle 5X cap. Existing cycles are deliberately marked unreconciled:
-- historical ledger entries cannot be safely attributed to an investment automatically.
ALTER TABLE package_activations
  ADD COLUMN IF NOT EXISTS cap_multiple INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS cap_amount_paise BIGINT,
  ADD COLUMN IF NOT EXISTS credited_total_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cap_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_reason TEXT,
  ADD COLUMN IF NOT EXISTS verified_deposit_id UUID REFERENCES usdt_deposits(id);

ALTER TABLE package_activations DROP CONSTRAINT IF EXISTS package_activations_status_check;
ALTER TABLE package_activations
  ADD CONSTRAINT package_activations_status_check
  CHECK (status IN ('pending','active','matured','completed','cancelled'));

ALTER TABLE package_activations DROP CONSTRAINT IF EXISTS package_activations_cap_multiple_check;
ALTER TABLE package_activations
  ADD CONSTRAINT package_activations_cap_multiple_check CHECK (cap_multiple = 5);
ALTER TABLE package_activations DROP CONSTRAINT IF EXISTS package_activations_cap_amount_check;
ALTER TABLE package_activations
  ADD CONSTRAINT package_activations_cap_amount_check CHECK (cap_amount_paise IS NULL OR cap_amount_paise >= 0);
ALTER TABLE package_activations DROP CONSTRAINT IF EXISTS package_activations_credited_total_check;
ALTER TABLE package_activations
  ADD CONSTRAINT package_activations_credited_total_check CHECK (credited_total_paise >= 0);

UPDATE package_activations
SET cap_amount_paise = amount_paise * 5
WHERE cap_amount_paise IS NULL AND amount_paise <= 1844674407370955161;

CREATE INDEX IF NOT EXISTS idx_package_activations_cap
  ON package_activations(user_id, status, cap_reconciled, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_package_activations_verified_deposit
  ON package_activations(verified_deposit_id) WHERE verified_deposit_id IS NOT NULL;

-- A legacy cycle can only be enabled after an administrator reconciles its historic
-- eligible payouts from the immutable ledger. This avoids silently resetting old caps.
CREATE OR REPLACE FUNCTION gf_reconcile_legacy_activation(
  p_activation_id UUID,
  p_historical_paid_paise BIGINT,
  p_admin_id UUID
) RETURNS VOID AS $$
DECLARE
  v_activation package_activations%ROWTYPE;
BEGIN
  IF p_historical_paid_paise < 0 THEN
    RAISE EXCEPTION 'Historical paid amount cannot be negative';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_admin_id AND role = 'admin' AND account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active administrator authorization required';
  END IF;

  SELECT * INTO v_activation
  FROM package_activations
  WHERE id = p_activation_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Investment activation not found'; END IF;
  IF v_activation.status NOT IN ('active','matured','completed') THEN
    RAISE EXCEPTION 'Only existing active or completed cycles can be reconciled';
  END IF;
  IF v_activation.cap_reconciled THEN
    RAISE EXCEPTION 'Investment cap has already been reconciled';
  END IF;
  IF v_activation.cap_amount_paise IS NULL THEN
    RAISE EXCEPTION 'Investment cap amount is unavailable; manual review required';
  END IF;

  UPDATE package_activations
  SET credited_total_paise = p_historical_paid_paise,
      cap_reconciled = TRUE,
      status = CASE WHEN p_historical_paid_paise >= cap_amount_paise THEN 'completed' ELSE status END,
      completed_at = CASE WHEN p_historical_paid_paise >= cap_amount_paise THEN COALESCE(completed_at, now()) ELSE completed_at END,
      completion_reason = CASE WHEN p_historical_paid_paise >= cap_amount_paise THEN '5x_cap_reached_after_legacy_reconciliation' ELSE completion_reason END
  WHERE id = p_activation_id;

  INSERT INTO audit_logs(actor_user_id, action, entity_type, entity_id, payload)
  VALUES (p_admin_id, 'investment.cap.legacy_reconciled', 'package_activation', p_activation_id::text,
          jsonb_build_object('historicalPaidPaise', p_historical_paid_paise, 'capAmountPaise', v_activation.cap_amount_paise));
END;
$$ LANGUAGE plpgsql;

-- New activations can only be created from an approved, verified deposit.
-- amount_paise stores two-decimal minor units; USDT token base units use 18 decimals.
CREATE OR REPLACE FUNCTION gf_activate_verified_investment(
  p_user_id UUID,
  p_package_id UUID,
  p_deposit_id UUID,
  p_admin_id UUID
) RETURNS UUID AS $$
DECLARE
  v_deposit usdt_deposits%ROWTYPE;
  v_package packages%ROWTYPE;
  v_amount_paise BIGINT;
  v_activation_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_admin_id AND role = 'admin' AND account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active administrator authorization required';
  END IF;

  SELECT * INTO v_deposit FROM usdt_deposits
  WHERE id = p_deposit_id AND user_id = p_user_id AND status = 'approved'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'An approved deposit for this user is required'; END IF;
  IF EXISTS (SELECT 1 FROM package_activations WHERE verified_deposit_id = p_deposit_id) THEN
    RAISE EXCEPTION 'This deposit has already been used for an investment';
  END IF;

  IF MOD(v_deposit.amount_base_units, 10000000000000000) <> 0 THEN
    RAISE EXCEPTION 'Deposit amount cannot be represented at two decimal places';
  END IF;
  v_amount_paise := (v_deposit.amount_base_units / 10000000000000000)::BIGINT;
  IF v_amount_paise <= 0 THEN RAISE EXCEPTION 'Investment amount must be positive'; END IF;

  SELECT * INTO v_package FROM packages WHERE id = p_package_id AND active = TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected package is not active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND role = 'user' AND account_status = 'active') THEN
    RAISE EXCEPTION 'User account is not active';
  END IF;

  INSERT INTO package_activations
    (user_id, package_id, amount_paise, status, activated_at, cap_multiple,
     cap_amount_paise, credited_total_paise, cap_reconciled, verified_deposit_id)
  VALUES
    (p_user_id, p_package_id, v_amount_paise, 'active', now(), 5,
     v_amount_paise * 5, 0, TRUE, p_deposit_id)
  RETURNING id INTO v_activation_id;

  INSERT INTO audit_logs(actor_user_id, action, entity_type, entity_id, payload)
  VALUES (p_admin_id, 'investment.activated.from_verified_deposit', 'package_activation', v_activation_id::text,
          jsonb_build_object('userId', p_user_id, 'packageId', p_package_id, 'depositId', p_deposit_id,
                             'amountMinorUnits', v_amount_paise, 'capMultiple', 5, 'capAmountMinorUnits', v_amount_paise * 5));
  RETURN v_activation_id;
END;
$$ LANGUAGE plpgsql;

-- Route every eligible income/principal-return credit through this function.
-- It serializes each cycle, splits a payout across active cycles if necessary,
-- and credits no more than the remaining 5X headroom. A repeated reference fails
-- against the immutable ledger's unique reference constraint rather than double-paying.
CREATE OR REPLACE FUNCTION gf_post_capped_income(
  p_user_id UUID,
  p_transaction_type TEXT,
  p_amount_paise BIGINT,
  p_reference TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_created_by UUID DEFAULT NULL,
  p_wallet_type TEXT DEFAULT 'income'
) RETURNS BIGINT AS $$
DECLARE
  v_activation package_activations%ROWTYPE;
  v_wallet_id UUID;
  v_remaining_request BIGINT;
  v_headroom BIGINT;
  v_credit BIGINT;
  v_total_credited BIGINT := 0;
  v_new_total BIGINT;
BEGIN
  IF p_amount_paise <= 0 THEN RAISE EXCEPTION 'Income amount must be positive'; END IF;
  IF NULLIF(BTRIM(p_reference), '') IS NULL THEN RAISE EXCEPTION 'Unique reference is required'; END IF;
  IF p_wallet_type NOT IN ('income','fund') THEN RAISE EXCEPTION 'Invalid wallet type'; END IF;
  IF p_transaction_type NOT IN (
    'basic_roi','basic_level','basic_referral','fd_roi','fd_level','fd_referral',
    'joining_bonus','salary_income','bonus_income','referral_bonus','level_bonus',
    'fd_released','principal_return'
  ) THEN RAISE EXCEPTION 'Transaction type is not eligible for the investment cap'; END IF;

  SELECT id INTO v_wallet_id
  FROM wallets
  WHERE user_id = p_user_id AND wallet_type = p_wallet_type
  ORDER BY CASE WHEN currency = 'USDT' THEN 0 ELSE 1 END, created_at, id
  LIMIT 1
  FOR UPDATE;
  IF v_wallet_id IS NULL THEN RAISE EXCEPTION 'Required wallet was not found'; END IF;

  v_remaining_request := p_amount_paise;
  FOR v_activation IN
    SELECT * FROM package_activations
    WHERE user_id = p_user_id AND status = 'active' AND cap_reconciled = TRUE
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_request <= 0;
    IF v_activation.cap_amount_paise IS NULL THEN
      RAISE EXCEPTION 'Investment cap is not configured; payout blocked';
    END IF;

    v_headroom := GREATEST(v_activation.cap_amount_paise - v_activation.credited_total_paise, 0);
    IF v_headroom = 0 THEN
      UPDATE package_activations
      SET status = 'completed', completed_at = COALESCE(completed_at, now()),
          completion_reason = '5x_cap_reached'
      WHERE id = v_activation.id;
      CONTINUE;
    END IF;

    v_credit := LEAST(v_headroom, v_remaining_request);
    v_new_total := v_activation.credited_total_paise + v_credit;

    INSERT INTO ledger_transactions(reference, transaction_type, status, metadata, created_by)
    VALUES (
      p_reference || ':' || v_activation.id::text,
      p_transaction_type,
      'posted',
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'capEligible', TRUE,
        'activationId', v_activation.id,
        'capMultiple', 5,
        'requestedAmountMinorUnits', p_amount_paise,
        'creditedAmountMinorUnits', v_credit,
        'walletType', p_wallet_type
      ),
      p_created_by
    );

    INSERT INTO ledger_entries(transaction_id, wallet_id, direction, amount_paise)
    SELECT id, v_wallet_id, 'credit', v_credit
    FROM ledger_transactions
    WHERE reference = p_reference || ':' || v_activation.id::text;

    UPDATE package_activations
    SET credited_total_paise = v_new_total,
        status = CASE WHEN v_new_total >= cap_amount_paise THEN 'completed' ELSE 'active' END,
        completed_at = CASE WHEN v_new_total >= cap_amount_paise THEN now() ELSE completed_at END,
        completion_reason = CASE WHEN v_new_total >= cap_amount_paise THEN '5x_cap_reached' ELSE completion_reason END
    WHERE id = v_activation.id;

    v_total_credited := v_total_credited + v_credit;
    v_remaining_request := v_remaining_request - v_credit;
  END LOOP;

  RETURN v_total_credited;
END;
$$ LANGUAGE plpgsql;

-- A token amount with 18 decimals can exceed BIGINT even for a small USDT deposit.
-- NUMERIC preserves the exact on-chain base units without floating-point conversion.
ALTER TABLE usdt_deposits
  ALTER COLUMN amount_base_units TYPE NUMERIC(78,0)
  USING amount_base_units::NUMERIC(78,0);
