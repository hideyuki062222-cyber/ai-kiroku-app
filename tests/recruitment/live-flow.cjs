// Isolated integration test: real application/API/handler/SQL; Auth, CAPTCHA and HTTP are simulated.
// No live service is contacted. This is not a real-browser production E2E test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url'),{JSDOM}=require('jsdom'),{PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',origin='https://test.example.invalid';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
(async()=>{
 const db=new PGlite();let dom;try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;`);
 await db.exec(read('database/recruitment_head_office_draft.sql'));
 await db.exec(`INSERT INTO auth.users VALUES('${admin}'); INSERT INTO public.recruitment_admins(user_id) VALUES('${admin}');`);
 const seedContext={window:{}};vm.createContext(seedContext);vm.runInContext(read('recruitment/draft-terms.js'),seedContext);const seed=seedContext.window.BROOK_DRAFT;
 await db.query('UPDATE public.recruitment_templates SET terms=$1',[JSON.stringify(seed.terms)]);
 for(const [code,l] of Object.entries(seed.locations))await db.query('UPDATE public.recruitment_locations SET address=$1,access=$2 WHERE code=$3',[l.address,l.access,code]);
 await db.query('UPDATE public.recruitment_settings SET privacy_text=$1,contact_text=$2,retention_days=$3,privacy_version=$4,release_enabled=true',[seed.privacyText,seed.contactText,seed.retentionDays,seed.privacyVersion]);
 await db.exec('UPDATE public.recruitment_jobs SET is_published=true');
 let queue=Promise.resolve();
 const queryAs=(role,sql,params=[])=>{const task=queue.then(async()=>{await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${role==='authenticated'?admin:''}',false); SET ROLE ${role};`);try{return (await db.query(sql,params)).rows;}finally{await db.exec('RESET ROLE');}});queue=task.catch(()=>{});return task;};
 const {createHandler}=await import(pathToFileURL(path.join(root,'recruitment/server/handler.mjs')));
 let rpcCalls=0,captchaCalls=0,loseFirstResponse=true;
 const backendFetch=async(url,opts)=>{
  if(url==='https://challenges.cloudflare.com/turnstile/v0/siteverify'){captchaCalls++;return json({success:true,action:'brook_apply',hostname:new URL(origin).hostname});}
  assert.equal(url,'https://local-db.invalid/rest/v1/rpc/recruitment_receive');rpcCalls++;const body=JSON.parse(opts.body);
  try{const rows=await queryAs('service_role','SELECT public.recruitment_receive($1,$2,$3) AS receipt',[JSON.stringify(body.p_payload),body.p_payload_hash,body.p_contact_hash]);return json(rows[0].receipt);}catch(e){return json({message:e.message},400);}
 };
 const handler=createHandler({SUPABASE_URL:'https://local-db.invalid',SUPABASE_SERVICE_ROLE_KEY:'fake-service',BROOK_ALLOWED_ORIGINS:origin,BROOK_INTAKE_ENABLED:'true',BROOK_TURNSTILE_SECRET_KEY:'fake-captcha',BROOK_CONTACT_HASH_SECRET:'fake-contact-key-for-local-test-only'},backendFetch);
 const transport=async(url,opts={})=>{
  const u=new URL(url);assert.equal(u.origin,'https://local-db.invalid');const auth=opts.headers?.Authorization;
  if(u.pathname==='/functions/v1/brook-recruitment-intake'){
   assert(!auth,'application must not carry an admin JWT');
   const response=await handler(new Request(url,{...opts,headers:{...opts.headers,Origin:origin}}));
   if(loseFirstResponse&&response.status===201){loseFirstResponse=false;throw Error('simulated lost response');}return response;
  }
  if(u.pathname==='/auth/v1/token')return json({access_token:'fake-admin',expires_in:3600});
  if(u.pathname==='/auth/v1/user'){assert.equal(auth,'Bearer fake-admin');return json({id:admin});}
  const table=u.pathname.replace('/rest/v1/','');
  assert(['recruitment_public_jobs','recruitment_admins','recruitment_locations','recruitment_templates','recruitment_jobs','recruitment_settings','recruitment_applicants'].includes(table));
  const role=auth==='Bearer fake-admin'?'authenticated':'anon';
  return json(await queryAs(role,'SELECT * FROM public.'+table));
 };
 dom=new JSDOM(read('recruitment/index.html').replace(/<script[^>]*src[^>]*><\/script>/g,''),{url:origin,runScripts:'outside-only'});
 const w=dom.window,d=w.document;w.confirm=()=>true;w.scrollTo=()=>{};w.fetch=transport;w.AbortSignal=AbortSignal;
 w.BROOK_CONFIG={enabled:true,url:'https://local-db.invalid',key:'fake-public',turnstileSiteKey:'fake-site'};
 let tokenCount=0;
 const mount=()=>{let field=d.querySelector('[name="cf-turnstile-response"]');if(!field){field=d.createElement('input');field.type='hidden';field.name='cf-turnstile-response';d.getElementById('challenge').append(field);}field.value='fake-token-'+(++tokenCount);};
 w.turnstile={render(){mount();return tokenCount;},reset(){mount();}};
 for(const p of ['core.js','api.js','app.js'])w.eval(read('recruitment/'+p));
 const until=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out: '+label+' / '+d.getElementById('status').textContent);};
 const click=text=>{const b=[...d.querySelectorAll('button')].find(x=>x.textContent===text);assert(b,text);b.click();};
 const fill=(id,value)=>{d.getElementById(id).value=value;d.getElementById(id).dispatchEvent(new w.Event('input'));};
 const submit=()=>d.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>d.querySelectorAll('.cards button').length===3,'public jobs');
 const names=['COZY蒲生','COZY豊中','COZY堺'];
 for(let i=0;i<3;i++){
  const card=[...d.querySelectorAll('.cards .panel')].find(x=>x.textContent.includes(names[i]));card.querySelector('button').click();click('この求人に応募する');
  fill('full_name',i===0?'<img src=x onerror=alert(1)>':'架空テスト'+i);fill('email',`test${i}@example.invalid`);fill('message','架空の通し確認');
  const callsBefore=rpcCalls;submit();await new Promise(r=>setTimeout(r,40));assert.equal(rpcCalls,callsBefore,'missing consent cannot submit');
  d.getElementById('consent').checked=true;submit();
  if(i===0){await until(()=>d.getElementById('status').textContent.includes('simulated lost response'),'lost response');assert.equal(d.getElementById('email').value,'test0@example.invalid');submit();}
  await until(()=>d.body.textContent.includes('応募を受け付けました'),'receipt');click('勤務地一覧に戻る');
 }
 const rows=await queryAs('service_role','SELECT * FROM public.recruitment_applicants');assert.equal(rows.length,3);assert.equal(rpcCalls,4);assert.equal(captchaCalls,4);
 click('採用担当者ログイン');fill('login-email','admin@example.invalid');fill('login-password','fake-password');submit();
 await until(()=>d.querySelectorAll('.applicant').length===3,'HQ inbox');assert(!d.querySelector('img'),'HTML injection must remain plain text');
 for(const name of names)assert(d.body.textContent.includes(name));
 const filter=d.querySelector('[aria-label="勤務地で絞り込み"]');filter.value=filter.options[1].value;filter.dispatchEvent(new w.Event('change'));assert.equal(d.querySelectorAll('.applicant').length,1);
 click('ログアウト');assert(d.getElementById('admin-nav').hidden);assert(!d.body.textContent.includes('架空テスト'));assert.equal(w.localStorage.length+w.sessionStorage.length,0);
 console.log('PASS isolated live-mode flow: all 3 locations -> validation -> handler -> PostgreSQL -> HQ inbox; response-loss retry has no duplicate; filtering, XSS, logout and no browser storage verified. External Auth/CAPTCHA/HTTP simulated; production unchanged.');
 }finally{dom?.window.close();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
