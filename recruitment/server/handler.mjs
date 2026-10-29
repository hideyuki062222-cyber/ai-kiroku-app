// Pure Fetch handler, testable without credentials or a live Supabase database.
import '../core.js';
const C=globalThis.BrookCore;
export function createHandler(env, fetcher=fetch) {
 const allowed=(env.BROOK_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
 return async req=>{
  const origin=req.headers.get('Origin')||'';
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(allowed.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='content-type,apikey';headers['Access-Control-Allow-Methods']='POST,OPTIONS';}
  const respond=(status,message,extra={})=>new Response(JSON.stringify({message,...extra}),{status,headers});
  if(!allowed.includes(origin))return respond(403,'このページからは応募できません。');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return respond(405,'この操作は利用できません。');
  if(env.BROOK_INTAKE_ENABLED!=='true'||!env.TURNSTILE_SECRET_KEY||!env.BROOK_CONTACT_HASH_SECRET||!env.SUPABASE_SERVICE_ROLE_KEY||!env.SUPABASE_URL)return respond(503,'応募受付の準備中です。');
  if(!req.headers.get('Content-Type')?.startsWith('application/json'))return respond(415,'入力形式を確認してください。');
  try{
   // Limit actual bytes, including chunked requests; do not trust Content-Length.
   const reader=req.body?.getReader();if(!reader)return respond(400,'応募内容を確認してください。');let chunks=[],size=0;
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384){await reader.cancel();return respond(413,'入力内容が長すぎます。');}chunks.push(part.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return respond(400,'応募内容を確認してください。');}
   if(!body||typeof body!=='object'||Array.isArray(body))return respond(400,'応募内容を確認してください。');
   const checked=C.validateApplication(body);if(checked.errors.length||body.website)return respond(400,'応募内容・同意を確認してください。');
   if(typeof body.captcha_token!=='string'||body.captcha_token.length<1||body.captcha_token.length>2048)return respond(400,'送信前の確認をやり直してください。');
   const verification=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:body.captcha_token}),signal:AbortSignal.timeout(10000)});
   if(!verification.ok)return respond(503,'確認機能に接続できません。再試行してください。');
   const check=await verification.json();
   if(check.success!==true||check.action!=='brook_apply'||check.hostname!==new URL(origin).hostname)return respond(400,'送信前の確認をやり直してください。');
   const payload=checked.value;
   const hmacKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.BROOK_CONTACT_HASH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
   const contact=payload.email?payload.email.toLowerCase():payload.phone.replace(/[^0-9+]/g,'');
   const contactHash=hex(await crypto.subtle.sign('HMAC',hmacKey,new TextEncoder().encode(contact)));
   const payloadHash=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))));
   const r=await fetcher(env.SUPABASE_URL+'/rest/v1/rpc/recruitment_receive',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_payload:payload,p_payload_hash:payloadHash,p_contact_hash:contactHash}),signal:AbortSignal.timeout(15000)});
   if(!r.ok){const err=await r.json().catch(()=>({}));if(String(err.message).includes('rate limit'))return respond(429,'受付が混み合っています。時間をおいてお試しください。');if(String(err.message).includes('request conflict'))return respond(409,'送信内容が変更されています。求人を選び直してください。');return respond(503,'受付を確認できません。案内を再確認し、同じ画面から再試行してください。');}
   const receipt=await r.json();if(typeof receipt!=='string')return respond(503,'受付結果を確認できません。再試行してください。');
   return respond(201,'応募を受け付けました。',{receipt});
  }catch{return respond(503,'受付結果を確認できません。同じ画面から再試行してください。');}
 };
}
