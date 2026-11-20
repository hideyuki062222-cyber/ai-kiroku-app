// Additional migration/maintenance adversarial tests. Synthetic data; no network.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_PATH||'@electric-sql/pglite');
const {setup,ids,migration,uuid}=require('./scoped_fixture.cjs');
const sql=fs.readFileSync(migration,'utf8');let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const deny=async(fn,re=/required|denied|permission|invalid|conflict|forbidden|legacy_scope/)=>{await assert.rejects(fn,re);checks++;};
(async()=>{
 const db=new PGlite(),{A,B,ADMIN,LEGACY,STAFF,TARGET,SECOND,CHOICE,CA}=ids;
 const q=async(s,p=[])=>(await db.query(s,p)).rows;
 const owner=async()=>{await db.exec('set session authorization postgres;reset role');await q("select set_config('request.jwt.claim.sub','',false)");await q("select set_config('request.jwt.claims','',false)");await q("select set_config('request.jwt.claim.role','',false)");};
 const as=async(u,role='authenticated')=>{await owner();await db.exec('set role '+role);await q("select set_config('request.jwt.claim.sub',$1,false)",[u||'']);};
 const trusted=async()=>(await q('select private.is_trusted_facility_maintenance() yes'))[0].yes;
 const revision=async(u=TARGET,o=A)=>(await q('select public.get_facility_permission_set($1,$2) x',[o,u]))[0].x?.revision||0;
 const patch=async(changes,u=TARGET,o=A,rev=null)=>q('select public.set_facility_permissions($1,$2,$3,$4) x',[o,u,rev??await revision(u,o),JSON.stringify(changes)]);
 const grants=async()=>q('select organization_id,user_id,feature,scope,ctid::text row_identity from public.organization_feature_permissions order by organization_id,user_id,feature');
 try{
  await setup(db,{migrate:false});await owner();
  const oldMaintenance=(await q("update public.cashbook_choices set label='架空の保守変更' where id=$1 returning id",[CHOICE])).length;
  await db.exec(sql);eq(oldMaintenance,1);eq(await trusted(),true,'direct privileged maintenance');
  eq((await q("update public.cashbook_choices set label='架空の保守変更を維持' where id=$1 returning id",[CHOICE])).length,1,'existing maintenance operation retained');
  // Older authentication requirements remain; maintenance does not bypass old guards.
  await deny(()=>q("update public.cashbook_entries set memo='未認証' where id=$1",[ids.CASH]),/not_authenticated/);
  await deny(()=>q('insert into public.meal_prices(organization_id,effective_date,morning,lunch,evening) values($1,current_date+20,331,441,551)',[A]),/ログイン|authenticated/);
  await as(ADMIN);eq(await trusted(),false,'a real user always follows feature checks');
  await as(null);eq(await trusted(),false,'missing subject does not become maintenance');
  await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role',user_metadata:{role:'service_role',admin:true}})]);
  eq(await trusted(),false,'claimed role does not override actual DB role');
  await owner();
  await db.exec(`create function public.synthetic_maintenance_probe() returns boolean language sql security definer set search_path='' as $$select private.is_trusted_facility_maintenance()$$;grant execute on function public.synthetic_maintenance_probe() to authenticated,anon;`);
  await db.exec(`create function public.synthetic_definer_write() returns void language sql security definer set search_path='' as $$update public.cashbook_choices set label='不正な変更' where id='${CHOICE}'$$;grant execute on function public.synthetic_definer_write() to authenticated;`);
  for(const uid of [null,STAFF,LEGACY]){
   await as(uid);eq((await q('select public.synthetic_maintenance_probe() yes'))[0].yes,false,'definer cannot turn client into maintenance');
   await deny(()=>q('select public.synthetic_definer_write()'),/facility_edit_required/);
  }
  await as(null,'anon');eq((await q('select public.synthetic_maintenance_probe() yes'))[0].yes,false);
  await deny(()=>q('select public.set_facility_permissions($1,$2,0,\'{}\')',[A,TARGET]));
  // Direct database logins keep session_user even when a definer changes current_user.
  await owner();await db.exec('set session authorization authenticated');
  eq((await q('select public.synthetic_maintenance_probe() yes'))[0].yes,false,'untrusted session with ROLE none');
  await deny(()=>q('select public.synthetic_definer_write()'),/facility_edit_required/);
  await owner();
  // Minimal synthetic grants only: production schema/table privileges are not expanded.
  await db.exec('grant usage on schema auth,private to service_role');
  await db.exec('set session authorization authenticator;set role service_role');
  eq(await trusted(),false,'service context without verified service claim');
  await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
  eq(await trusted(),true,'verified service role and actual PostgREST role agree');
  await owner();await db.exec('set session authorization authenticator;set role authenticated');
  await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
  eq((await q('select public.synthetic_maintenance_probe() yes'))[0].yes,false,'authenticator remains constrained by active role');
  await owner();
  const fn=(await q("select prosecdef,proconfig from pg_proc where oid='private.is_trusted_facility_maintenance()'::regprocedure"))[0];
  eq(fn.prosecdef,false);eq(fn.proconfig,['search_path=""']);
  eq((await q("select has_function_privilege('anon','private.is_trusted_facility_maintenance()','execute') x"))[0].x,false);
  eq((await q("select has_table_privilege('authenticated','public.organization_feature_permissions','INSERT,UPDATE,DELETE') x"))[0].x,false);
  eq((await q("select has_table_privilege('authenticated','private.feature_permission_history','SELECT,INSERT,UPDATE,DELETE') x"))[0].x,false);
  eq((await q("select relrowsecurity from pg_class where oid='private.feature_permission_history'::regclass"))[0].relrowsecurity,true);
  eq((await q("select bool_and(relrowsecurity) x from pg_class where oid in('public.organization_permission_sets'::regclass,'public.organization_feature_permissions'::regclass,'public.care_record_amendments'::regclass,'public.facility_operation_history'::regclass,'private.feature_permission_history'::regclass)"))[0].x,true);
  for(const signature of ['get_facility_permission_set(uuid,uuid)','set_facility_permissions(uuid,uuid,bigint,jsonb)','amend_care_record(uuid,uuid,bigint,text,text,text)','edit_facility_staff_profile(uuid,uuid,jsonb,text,text,text)','facility_management_export(uuid,text,date,date)']){
   const proc=(await q('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',['public.'+signature]))[0];eq(proc.prosecdef,false);eq(proc.proconfig,['search_path=""']);
   eq((await q("select has_function_privilege('anon',$1,'execute') x",['public.'+signature]))[0].x,false);eq((await q("select has_function_privilege('authenticated',$1,'execute') x",['public.'+signature]))[0].x,true);
  }
  await as(ADMIN);await patch({resident_info:'full',exports:'full'});await patch({staff_info:'full'},SECOND);
  const before=await grants();await patch({meal_settings:'full'});const after=await grants();
  for(const row of before)eq(after.find(r=>r.organization_id===row.organization_id&&r.user_id===row.user_id&&r.feature===row.feature),row,'omitted grants retain their physical row and scope');
  let map=(await q('select public.get_facility_permission_set($1,$2) x',[A,TARGET]))[0].x.permissions;
  eq(map,{resident_info:'full',exports:'full',meal_settings:'full'});
  const sameBefore=await grants();await patch({exports:'full'});eq(await grants(),sameBefore,'unchanged grant is not rewritten');
  const revBefore=await revision();await patch({meal_settings:null});map=(await q('select public.get_facility_permission_set($1,$2) x',[A,TARGET]))[0].x.permissions;
  eq(map,{resident_info:'full',exports:'full'});
  const preserved=await grants();await patch({});eq(await grants(),preserved,'empty patch never clears grants');
  await deny(()=>patch({staff_info:'full'},TARGET,A,revBefore),/permission_conflict/);eq(await grants(),preserved);
  for(const invalid of [{unknown:null},{exports:42},{exports:false},{exports:[]},{resident_info:'legacy'}]){await deny(()=>patch(invalid));eq(await grants(),preserved,'invalid patch is atomic');}
  await deny(()=>patch(null));await deny(()=>patch([]));await deny(()=>patch({exports:'x'.repeat(2100)}));
  await owner();const audit=(await q('select previous,next_permissions from private.feature_permission_history where target_user_id=$1 order by occurred_at desc limit 1',[TARGET]))[0];eq(audit.previous,map);eq(audit.next_permissions,map);
  await as(STAFF);eq(await q('select * from public.organization_feature_permissions where user_id=$1',[TARGET]),[],'RLS hides other staff grants');eq(await q('select * from public.organization_feature_permissions where organization_id=$1',[B]),[],'RLS hides other facility grants');await deny(()=>patch({exports:'full'},STAFF,A,0),/admin_required/);
  await as(LEGACY);await deny(()=>patch({staff_info:'full'},TARGET,A,0),/admin_required/);
  await as(ADMIN);await deny(()=>patch({exports:'full'},ADMIN,A,0),/self_permission/);await deny(()=>patch({exports:'full'},TARGET,B,0),/admin_required/);
  await owner();await deny(()=>patch({exports:'full'},TARGET,A,0),/admin_required/);
  await as(ADMIN);await patch({handoff_settings:'legacy'},LEGACY);await deny(()=>q('select public.set_facility_editor($1,$2,false,true)',[A,LEGACY]),/ui_upgrade/);
  await owner();const originalGrants=await grants();await deny(()=>db.exec(sql),/already_present/);await db.exec('rollback');eq(await grants(),originalGrants,'second application cannot reset selections');
 }finally{await db.close();}

 // Fault injection proves preservation assertions really abort and roll back the migration.
 const marker='-- Same MVCC snapshot: concurrent business work';
 for(const [name,injected]of [
  ['resident',`update public.clients set display_name='意図しない変更' where id='${ids.CA}';`],
  ['membership',`update public.organization_members set staff_name='意図しない変更' where organization_id='${ids.A}' and user_id='${ids.STAFF}';`],
  ['auth_id',`insert into auth.users(id,email) values('${uuid(998)}','synthetic@example.invalid');`],
  ['legacy_grant',`delete from public.organization_feature_permissions where organization_id='${ids.A}' and user_id='${ids.LEGACY}' and feature='meal_settings';`]
 ]){
  const pg=new PGlite();try{await setup(pg,{migrate:false});await pg.exec('reset role');await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.ADMIN]);
   const snapshot=async()=>{const result={};for(const t of ['clients','organization_members','organization_staff','organization_facility_editors','care_records','cashbook_choices'])result[t]=(await pg.query('select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) x from public.'+t+' t')).rows[0].x;result.auth=(await pg.query('select jsonb_agg(id::text order by id) x from auth.users')).rows[0].x;return result;};
   const before=await snapshot();await deny(()=>pg.exec(sql.replace(marker,injected+'\n'+marker)),/permission_migration_(existing_data_mismatch|missing_legacy)/);await pg.exec('rollback');eq(await snapshot(),before,'rollback restores '+name);eq((await pg.query("select to_regclass('public.organization_permission_sets') x")).rows[0].x,null,'new tables also rolled back');
  }finally{await pg.close();}
 }
 const wrapped=new PGlite();try{
  await setup(wrapped,{migrate:false});await wrapped.exec('reset role;begin;select 1');
  await deny(()=>wrapped.exec(sql),/isolation level|before any query|repeatable_read/i);await wrapped.exec('rollback');
  eq((await wrapped.query("select to_regclass('public.organization_permission_sets') x")).rows[0].x,null,'incompatible outer transaction fails without migration');
 }finally{await wrapped.close();}
 console.log('PASS safe permission migration:',checks,'assertions: real roles, definer attacks, patch preservation, explicit revoke, ACL, stale versions and rollback faults');
})().catch(e=>{console.error(e.message,e.where,e.stack);process.exitCode=1;});
