const assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require(process.env.PGLITE_PATH||'@electric-sql/pglite'),{setup,ids}=require('./helpers/routine_fixture.cjs');
(async()=>{const db=new PGlite(),{A,B,ADMIN,STAFF,EDITOR,OTHER,CA,CB,REC}=ids;let checks=0;const q=async(s,p=[])=>(await db.query(s,p)).rows,eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++},deny=async(fn,re=/permission|admin_required|facility_edit|not_authenticated|conflict|invalid|not_found|duplicate/)=>{await assert.rejects(fn,re);checks++};
 const as=async uid=>{await db.exec('reset role;set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]);};
 const items=[{kind:'action',value:'起き上がりを介助した'}],save=(org,client,rev,service='起床介助',is=items,ref='')=>q('select public.save_routine_care($1,$2,$3,$4,$5,$6) x',[org,client,rev,service,JSON.stringify(is),ref]);
 try{
  await setup(db,false);const records=await q('select to_jsonb(r) x from public.care_records r'),clients=await q('select to_jsonb(c) x from public.clients c order by id');
  await db.exec(fs.readFileSync('supabase/migrations/20261122003150_resident_routine_care.sql','utf8'));
  eq(await q('select to_jsonb(r) x from public.care_records r'),records,'migration preserves records');eq(await q('select to_jsonb(c) x from public.clients c order by id'),clients,'migration preserves residents');
  await as(STAFF);await deny(()=>save(A,CA,0));await deny(()=>q("update public.client_record_profiles set routine_care='{}' where client_id=$1",[CA]));
  await as(EDITOR);await deny(()=>save(A,CA,0),/facility_edit_required/);
  await as(ADMIN);const x=(await save(A,CA,0))[0].x;eq(x.revision,1);eq(x.routine_care['起床介助'].items,items);eq(x.data,{});eq(x.updated_by,ADMIN);
  await deny(()=>save(A,CA,0),/revision_conflict/);await deny(()=>save(A,CA,null),/revision_conflict/);await deny(()=>save(A,CB,0),/not_found/);
  const rowBefore=x;
  for(const bad of ['体調良好なら介助する','服薬は未確認で支援する','笑顔で起き上がりを介助する'])await deny(()=>save(A,CA,1,'起床介助',[{kind:'custom',value:bad}]));
  await db.exec('begin');const custom=(await save(A,CA,1,'起床介助',[{kind:'custom',value:'腰に手を添えて起き上がりを介助する'}]))[0].x;eq(custom.routine_care['起床介助'].items[0].kind,'custom');await db.exec('rollback');
for(const bad of [[{kind:'reaction',value:'笑顔'}],[{kind:'action',value:'薬を追加で投与した'}],[{kind:'action',value:items[0].value,role:'admin'}],null])await deny(()=>save(A,CA,1,'起床介助',bad));
  await deny(()=>save(A,CA,1,'不正サービス'));await deny(()=>save(A,CA,1,'起床介助',items,'usual'));await deny(()=>save(A,CA,1,'起床介助',[...items,...items]),/duplicate/);
  eq((await q('select to_jsonb(p) x from public.client_record_profiles p where client_id=$1',[CA]))[0].x,rowBefore,'invalid calls leave data unchanged');
  const y=(await save(A,CA,1,'食事介助',[{kind:'action',value:'食事中の見守りを行った'}],'communication'))[0].x;eq(y.routine_care['起床介助'],x.routine_care['起床介助'],'PATCH preserves other services');eq(y.revision,2);
  // The previous profile RPC must preserve the new column, including old UI payloads.
  const legacy=(await q('select usual,trait,caution,communication,support_method from public.clients where id=$1',[CA]))[0];
  const oldSave=(rev,data)=>q('select public.save_record_profile($1,$2,$3,$4,$5,$5) x',[A,CA,rev,JSON.stringify(data),JSON.stringify(legacy)]);
  const z=(await oldSave(2,{support:{choices:[],note:'既存プロフィールの変更'}}))[0].x;eq(z.routine_care,y.routine_care,'old UI does not erase care settings');eq(z.data.support.note,'既存プロフィールの変更');
  const perm=(await q('select revision from public.organization_permission_sets where organization_id=$1 and user_id=$2',[A,EDITOR]))[0];await q('select public.set_facility_permissions($1,$2,$3,$4)',[A,EDITOR,perm.revision,JSON.stringify({resident_info:'full'})]);
  await as(EDITOR);const e=(await save(A,CA,3))[0].x;eq(e.revision,4);await deny(()=>save(B,CB,0),/facility_edit_required/);await deny(()=>q('select public.set_facility_permissions($1,$2,0,$3)',[A,EDITOR,JSON.stringify({resident_info:'full'})]));
  await as(OTHER);await save(B,CB,0,'起床介助',[{kind:'action',value:'起床の声かけを行った'}]);eq((await q('select client_id from public.client_record_profiles')).map(r=>r.client_id),[CB],'other facility administrator cannot read A');
  await as(STAFF);eq((await q('select client_id from public.client_record_profiles order by client_id')).length,2,'membership permits own facilities only');await deny(()=>save(A,CA,4));
  await as(ADMIN);const p=(await q('select revision from public.organization_permission_sets where organization_id=$1 and user_id=$2',[A,EDITOR]))[0];await q('select public.set_facility_permissions($1,$2,$3,$4)',[A,EDITOR,p.revision,JSON.stringify({resident_info:null})]);
  await as(EDITOR);await deny(()=>save(A,CA,4));
  await as(ADMIN);await save(A,CA,4,'起床介助',[]);const final=(await q('select * from public.client_record_profiles where client_id=$1',[CA]))[0];eq(final.routine_care['起床介助'].items,[]);eq(final.routine_care['食事介助'],y.routine_care['食事介助']);
  await db.exec('reset role');eq(await q('select to_jsonb(r) x from public.care_records r'),records);eq(await q('select to_jsonb(c) x from public.clients c order by id'),clients);const history=await q('select * from private.record_profile_history order by id');eq(history.length,6);assert(history.some(h=>h.previous.profile?.routine_care?.['起床介助']?.items.length));
  await as(STAFF);await deny(()=>q('select * from private.record_profile_history'));await db.exec('reset role;set role anon');await deny(()=>q('select * from public.client_record_profiles'));await deny(()=>save(A,CA,5));
  await db.exec('reset role');await q("select set_config('request.jwt.claim.sub','',false)");await deny(()=>save(A,CA,5),/not_authenticated/);
  await db.exec('reset role');const backup=await db.dumpDataDir('gzip');const restored=new PGlite({loadDataDir:backup});try{eq((await restored.query('select to_jsonb(p) x from public.client_record_profiles p order by client_id')).rows,await q('select to_jsonb(p) x from public.client_record_profiles p order by client_id'),'isolated backup restores settings/profile exactly');eq((await restored.query('select * from private.record_profile_history order by id')).rows,history,'isolated backup restores audit history');eq((await restored.query('select to_jsonb(r) x from public.care_records r')).rows,records,'isolated backup restores existing records');await restored.exec('set role authenticated');await restored.query("select set_config('request.jwt.claim.sub',$1,false)",[STAFF]);await deny(()=>restored.query('select public.save_routine_care($1,$2,5,$3,$4,$5)',[A,CA,'起床介助','[]','']));}finally{await restored.close();}
  console.log('PASS routine care database',checks,'checks: additive migration, PATCH, old profile RPC compatibility, roles/revocation, direct API/SQL restrictions, cross-facility isolation, history and existing data');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
