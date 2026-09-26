import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"','""')}"`;
}

export async function GET() {
  await requireAdmin();
  const { rows } = await db.query(`SELECT u.referral_code,u.full_name,u.email,u.account_status,u.kyc_status,u.created_at,COALESCE(f.balance_paise,0)::bigint AS fund_balance_paise,COALESCE(i.balance_paise,0)::bigint AS income_balance_paise FROM users u LEFT JOIN LATERAL (SELECT SUM(CASE WHEN e.direction='credit' THEN e.amount_paise ELSE -e.amount_paise END)::bigint AS balance_paise FROM wallets w LEFT JOIN ledger_entries e ON e.wallet_id=w.id WHERE w.user_id=u.id AND w.wallet_type='fund') f ON true LEFT JOIN LATERAL (SELECT SUM(CASE WHEN e.direction='credit' THEN e.amount_paise ELSE -e.amount_paise END)::bigint AS balance_paise FROM wallets w LEFT JOIN ledger_entries e ON e.wallet_id=w.id WHERE w.user_id=u.id AND w.wallet_type='income') i ON true WHERE u.role='user' ORDER BY u.created_at DESC`);
  const header=['Referral ID','Name','Email','Account Status','KYC Status','Created At','Fund Balance Paise','Income Balance Paise'];
  const lines=[header.map(csvCell).join(','),...rows.map((r:any)=>[r.referral_code,r.full_name,r.email,r.account_status,r.kyc_status,new Date(r.created_at).toISOString(),r.fund_balance_paise,r.income_balance_paise].map(csvCell).join(','))];
  return new Response(lines.join('\n'),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="global-finance-users-report.csv"','cache-control':'no-store'}});
}
