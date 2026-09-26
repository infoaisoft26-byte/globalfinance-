import argon2 from 'argon2';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_NAME?.trim() || 'Global Finance Admin';
if (!connectionString || !email || !password || password.length < 12) {
  throw new Error('DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD (12+ chars) are required');
}
const pool = new Pool({ connectionString, max: 1, ssl: process.env.PGSSL === 'disable' ? false : undefined });
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
let referralCode;
for (let i=0;i<20;i++) {
  const candidate=`GF${Math.floor(100000+Math.random()*900000)}`;
  const exists=await pool.query('SELECT 1 FROM users WHERE referral_code=$1',[candidate]);
  if(!exists.rowCount){referralCode=candidate;break;}
}
if(!referralCode) throw new Error('Unable to generate referral code');
const client=await pool.connect();
try{
  await client.query('BEGIN');
  const existing=await client.query('SELECT id,role FROM users WHERE email=$1 FOR UPDATE',[email]);
  if(existing.rowCount){
    await client.query("UPDATE users SET role='admin',account_status='active',password_hash=$1,full_name=$2,updated_at=now() WHERE id=$3",[passwordHash,fullName,existing.rows[0].id]);
    await client.query("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,payload) VALUES($1,'admin.bootstrap.updated','user',$1::text,$2::jsonb)",[existing.rows[0].id,JSON.stringify({email})]);
  }else{
    const created=await client.query("INSERT INTO users(email,password_hash,full_name,referral_code,role,kyc_status,account_status) VALUES($1,$2,$3,$4,'admin','verified','active') RETURNING id",[email,passwordHash,fullName,referralCode]);
    await client.query("INSERT INTO wallets(user_id,wallet_type) VALUES($1,'fund'),($1,'income')",[created.rows[0].id]);
    await client.query("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,payload) VALUES($1,'admin.bootstrap.created','user',$1::text,$2::jsonb)",[created.rows[0].id,JSON.stringify({email})]);
  }
  await client.query('COMMIT');
  console.log(`Admin ready: ${email}`);
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
