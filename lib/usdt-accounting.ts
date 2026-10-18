/** Shared USDT formatting and payout safety gate. Ledger math must use PostgreSQL NUMERIC. */
export const USDT_CURRENCY = 'USDT' as const;
export const USDT_SCALE = 6;

export function formatUSDT(value: string | number | bigint | null | undefined): string {
  const raw = String(value ?? '0');
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return '0.000000 USDT';
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ''] = unsigned.split('.');
  const padded = (fraction + '0000000').slice(0, 7);
  const micros = BigInt(whole || '0') * 1_000_000n + BigInt(padded.slice(0, 6));
  const rounded = micros + (Number(padded[6]) >= 5 ? 1n : 0n);
  const output = `${rounded / 1_000_000n}.${String(rounded % 1_000_000n).padStart(6, '0')} USDT`;
  return negative ? `-${output}` : output;
}

export function assertUsdtPayoutsVerified(): void {
  if (process.env.PAYOUTS_ENABLED !== 'true' || process.env.USDT_ACCOUNTING_VERIFIED !== 'true') {
    throw new Error('USDT payouts are disabled until accounting migration and reconciliation are verified');
  }
}
