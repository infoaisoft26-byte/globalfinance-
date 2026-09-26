'use client';

import { useState } from 'react';

async function uploadPrivate(file: File, kind: 'identity'|'address') {
  const presign = await fetch('/api/kyc/upload-url',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contentType:file.type,kind,size:file.size})});
  if (!presign.ok) throw new Error((await presign.json()).error || 'Unable to prepare upload');
  const { uploadUrl, key } = await presign.json();
  const put = await fetch(uploadUrl,{method:'PUT',headers:{'content-type':file.type,'content-length':String(file.size)},body:file});
  if (!put.ok) throw new Error('Document upload failed');
  return key as string;
}

export function KycForm() {
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  return <form className="gf-card p-5" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try{
    const form=new FormData(e.currentTarget); const identity=form.get('identity') as File; const address=form.get('address') as File;
    if(!identity?.size) throw new Error('Identity document is required'); if(identity.size>8*1024*1024 || (address?.size??0)>8*1024*1024) throw new Error('Each file must be 8 MB or less');
    const documentStorageKey=await uploadPrivate(identity,'identity'); const addressStorageKey=address?.size?await uploadPrivate(address,'address'):null;
    const res=await fetch('/api/kyc/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({legalName:form.get('legalName'),documentType:form.get('documentType'),documentLast4:form.get('documentLast4'),documentStorageKey,addressStorageKey})});
    const data=await res.json(); if(!res.ok) throw new Error(data.error||'Submission failed'); setMessage('KYC submitted for review.'); (e.currentTarget as HTMLFormElement).reset();
  }catch(err){setMessage(err instanceof Error?err.message:'Submission failed');}finally{setBusy(false);}}}>
    <div className="grid gap-3 md:grid-cols-2"><input name="legalName" required minLength={2} maxLength={160} placeholder="Legal name" className="rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm"/><select name="documentType" className="rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm"><option value="pan">PAN</option><option value="aadhaar">Aadhaar</option><option value="passport">Passport</option><option value="driving_license">Driving Licence</option><option value="other">Other</option></select></div>
    <input name="documentLast4" maxLength={4} placeholder="Last 4 characters/digits (optional)" className="mt-3 w-full rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm"/>
    <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm text-slate-300">Identity document<input name="identity" required type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-2 block w-full text-xs text-slate-400"/></label><label className="text-sm text-slate-300">Address proof (optional)<input name="address" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-2 block w-full text-xs text-slate-400"/></label></div>
    <div className="mt-3 text-xs text-slate-500">Documents upload directly to private encrypted object storage using a short-lived signed URL.</div>{message&&<div className="mt-3 text-sm text-cyan-300">{message}</div>}<button disabled={busy} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy?'Submitting…':'Submit KYC'}</button>
  </form>;
}
