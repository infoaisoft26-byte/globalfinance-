import { db, withTransaction } from '@/lib/db';

export type CappedIncomeType =
  | 'basic_roi'
  | 'basic_level'
  | 'basic_referral'
  | 'fd_roi'
  | 'fd_level'
  | 'fd_referral'
  | 'joining_bonus'
  | 'salary_income'
  | 'bonus_income'
  | 'referral_bonus'
  | 'level_bonus'
  | 'fd_released'
  | 'principal_return';

export type CappedWalletType = 'income' | 'fund';

/**
 * Posts an eligible income/principal-return credit through the database's
 * serialized 5X cap function. Amounts are integer minor units; do not pass
 * floating-point numbers. A stable unique reference is required for retries.
 *
 * Returns the amount actually credited. This can be lower than requested when
 * the active investment cycles have insufficient remaining cap, and can be 0
 * when the user has no reconciled active investment.
 */
export async function postCappedIncome(input: {
  userId: string;
  transactionType: CappedIncomeType;
  amountMinorUnits: string | bigint;
  reference: string;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
  walletType?: CappedWalletType;
}): Promise<string> {
  const result = await withTransaction(async (client) => {
    return client.query<{ credited: string }>(
      `SELECT gf_post_capped_income(
        $1::uuid, $2::text, $3::bigint, $4::text, $5::jsonb, $6::uuid, $7::text
      )::text AS credited`,
      [
        input.userId,
        input.transactionType,
        String(input.amountMinorUnits),
        input.reference,
        JSON.stringify(input.metadata ?? {}),
        input.createdBy ?? null,
        input.walletType ?? 'income',
      ],
    );
  });
  return result.rows[0]?.credited ?? '0';
}

/**
 * Starts a fresh 5X cycle only from an approved, verified deposit.
 * The database function validates the active admin, package, deposit ownership,
 * deposit reuse, and exact decimal conversion before inserting the activation.
 */
export async function activateVerifiedInvestment(input: {
  userId: string;
  packageId: string;
  depositId: string;
  adminId: string;
}): Promise<string> {
  const result = await withTransaction(async (client) => {
    return client.query<{ activation_id: string }>(
      `SELECT gf_activate_verified_investment(
        $1::uuid, $2::uuid, $3::uuid, $4::uuid
      )::text AS activation_id`,
      [input.userId, input.packageId, input.depositId, input.adminId],
    );
  });
  const activationId = result.rows[0]?.activation_id;
  if (!activationId) throw new Error('Investment activation was not created');
  return activationId;
}

/**
 * Existing activations remain payout-blocked until their historical credited
 * amounts have been reconciled against the immutable ledger by an administrator.
 */
export async function reconcileLegacyActivation(input: {
  activationId: string;
  historicalPaidMinorUnits: string | bigint;
  adminId: string;
}): Promise<void> {
  await db.query(
    'SELECT gf_reconcile_legacy_activation($1::uuid, $2::bigint, $3::uuid)',
    [input.activationId, String(input.historicalPaidMinorUnits), input.adminId],
  );
}
