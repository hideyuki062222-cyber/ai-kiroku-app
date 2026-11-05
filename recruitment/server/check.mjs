// Read-only HQ diagnostics. Never calls the intake RPC or writes database rows.
export function createCheckHandler(env, fetcher=fetch) {
 const allowed=(env.BROOK_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
 return async req=>{
  const origin=req.headers.get('Origin')||'';
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  const reply=(status,message)=>new Response(JSON.stringify({message}),{status,headers});
  if(!allowed.includes(origin))return reply(403,'このページでは確認できません。');
  Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply(405,'この操作は利用できません。');
  const authorization=req.headers.get('Authorization')||'';
  if(!/^Bearer \S+$/.test(authorization))return reply(401,'本部アカウントでログインしてください。');
  if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY)return reply(503,'接続設定を確認してください。');
  try {
   const authHeaders={apikey:env.SUPABASE_ANON_KEY,Authorization:authorization};
   const userResponse=await fetcher(env.SUPABASE_URL+'/auth/v1/user',{headers:authHeaders,signal:AbortSignal.timeout(10000)});
   if(!userResponse.ok)return reply(401,'もう一度ログインしてください。');
   const user=await userResponse.json();
   if(typeof user.id!=='string'||!user.id)return reply(401,'もう一度ログインしてください。');
   const membersResponse=await fetcher(env.SUPABASE_URL+'/rest/v1/recruitment_admins?select=user_id&is_active=eq.true&user_id=eq.'+encodeURIComponent(user.id),{headers:authHeaders,signal:AbortSignal.timeout(10000)});
   if(!membersResponse.ok)return reply(403,'採用管理権限を確認してください。');
   const members=await membersResponse.json();
   if(!Array.isArray(members)||!members.some(m=>m.user_id===user.id))return reply(403,'採用管理権限を確認してください。');
   if(!env.BROOK_TURNSTILE_SECRET_KEY?.trim()||!env.BROOK_CONTACT_HASH_SECRET||env.BROOK_CONTACT_HASH_SECRET.length<32)return reply(503,'秘密キーの保存内容を確認してください。');
   if(!req.headers.get('Content-Type')?.startsWith('application/json'))return reply(415,'入力形式を確認してください。');
   const reader=req.body?.getReader();if(!reader)return reply(400,'確認をやり直してください。');
   const chunks=[];let size=0;
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader.cancel();return reply(413,'入力内容が長すぎます。');}chunks.push(part.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,'確認をやり直してください。');}
   if(!body||Array.isArray(body)||typeof body.captcha_token!=='string'||!body.captcha_token||body.captcha_token.length>2048)return reply(400,'確認をやり直してください。');
   const verification=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.BROOK_TURNSTILE_SECRET_KEY,response:body.captcha_token}),signal:AbortSignal.timeout(10000)});
   if(!verification.ok)return reply(503,'確認機能に接続できません。再試行してください。');
   const check=await verification.json();
   if(check.success!==true||check.action!=='brook_apply'||check.hostname!==new URL(origin).hostname)return reply(400,'認証を確認できませんでした。もう一度お試しください。');
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.BROOK_CONTACT_HASH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('brook-read-only-check'));
   return reply(200,'接続テストに成功しました。迷惑応募対策と連続応募対策用の設定を確認できました。応募データの保存・求人の公開は行っていません。');
  }catch{return reply(503,'接続を確認できませんでした。時間をおいて再試行してください。');}
 };
}
