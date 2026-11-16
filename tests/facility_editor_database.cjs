// Actual production metadata baseline + new migration, synthetic identities, isolated Postgres only.
const {PGlite}=require(process.env.PGLITE_PATH||'@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [A,B,C,ADMIN,EDITOR,STAFF,OTHER,CA,CB,RETIRED,AS,REC,H,Q,SLOT]=[1,2,3,11,12,13,14,21,22,23,31,41,51,61,71].map(id);
(async()=>{const db=new PGlite();let checks=0;
const rows=async(sql,p=[])=> (await db.query(sql,p)).rows;
const owner=()=>db.exec('reset role');
const as=async(uid,role='authenticated')=>{await db.exec('reset role;set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const denied=async(fn,re=/permission denied|row.level security|admin_required|facility_edit_required|immutable|resident_basic|invalid_resident|staff_member|required|conflict/)=>{await assert.rejects(fn,re);checks++};
const snapshot=async names=>{await owner();const out={};for(const n of names)out[n]=await rows('select to_jsonb(t) row from public.'+n+' t order by to_jsonb(t)::text');return out};
const grant=(org,user,enabled,expected)=>db.query('select public.set_facility_editor($1,$2,$3,$4)',[org,user,enabled,expected]);
try{
 await db.exec(fs.readFileSync('tests/fixtures/facility_editor_schema.sql','utf8'));
 await db.query('insert into auth.users(id,email) select u,u::text||\'@example.invalid\' from unnest($1::uuid[]) u',[[ADMIN,EDITOR,STAFF,OTHER]]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ADMIN]);
 for(const [oid,name]of [[A,'施設A'],[B,'施設B'],[C,'停止検証']])await db.query('insert into public.organizations(id,name,created_by,join_code) values($1,$2,$3,$4)',[oid,name,ADMIN,oid.slice(-16)]);
 for(const [org,uid,role]of [[A,ADMIN,'admin'],[A,EDITOR,'staff'],[A,STAFF,'staff'],[B,EDITOR,'admin'],[B,STAFF,'staff'],[B,OTHER,'admin'],[C,ADMIN,'admin'],[C,EDITOR,'staff']])await db.query('insert into public.organization_members(organization_id,user_id,role,staff_name) values($1,$2,$3,$4)',[org,uid,role,'検証職員'+uid.slice(-2)]);
 for(const [cid,org,room,active]of [[CA,A,'101',true],[CB,B,'201',true],[RETIRED,A,'102',false]])await db.query('insert into public.clients(id,organization_id,code,display_name,room_number,is_active) values($1,$2,$3,$4,$5,$6)',[cid,org,cid,'同名利用者',room,active]);
 await db.query('insert into public.organization_staff(id,organization_id,staff_name,linked_user_id,created_by) values($1,$2,$3,$4,$5)',[id(81),A,'検証職員13',STAFF,ADMIN]);
 await db.query("insert into public.staff_assignments(id,organization_id,client_id,service_date,service_time,created_by,updated_by,memo) values($1,$2,$3,current_date,'09:00',$4,$4,'既存メモ')",[AS,A,CA,ADMIN]);
 await db.query('insert into public.care_records(id,organization_id,client_id,created_by,assignment_id) values($1,$2,$3,$4,$5)',[REC,A,CA,ADMIN,AS]);
 await db.query("insert into public.handoff_entries(id,organization_id,client_id,service_date,shift,body,created_by) values($1,$2,$3,current_date,'day','変更しない申し送り',$4)",[H,A,CA,ADMIN]);
 await db.query('insert into public.handoff_confirmations(entry_id,user_id) values($1,$2)',[H,STAFF]);
 await db.query("insert into public.handoff_quick_inputs(id,organization_id,label,category) values($1,$2,'既存項目','食事')",[Q,A]);
 await db.query("insert into public.client_service_slots(id,organization_id,client_id,service_time,service_contents) values($1,$2,$3,'09:00','[\"食事介助\"]')",[SLOT,A,CA]);
 await db.query('insert into public.meal_profiles(organization_id,client_id,start_date) values($1,$2,current_date-10)',[A,CA]);
 await db.query('insert into public.meal_prices(organization_id,effective_date,morning,lunch,evening) values($1,current_date,330,440,550)',[A]);
 await db.query("insert into public.meal_entries(organization_id,client_id,meal_date,meal,status) values($1,$2,current_date,'morning','served')",[A,CA]);
 const tables=['organizations','organization_members','organization_staff','clients','client_service_slots','staff_assignments','care_records','handoff_entries','handoff_confirmations','handoff_activity','handoff_quick_inputs','meal_profiles','meal_entries','meal_prices'];
 const before=await snapshot(tables);
 await db.exec(fs.readFileSync('supabase/migrations/20261115235721_facility_editor_permissions.sql','utf8'));
 eq(await snapshot(tables),before,'migration never updates/deletes existing rows');
 eq((await rows('select count(*)::int n from public.organization_facility_editors'))[0].n,0,'no automatic grants');
 await as(ADMIN);await grant(A,EDITOR,true,false);eq((await rows('select enabled from public.organization_facility_editors where organization_id=$1 and user_id=$2',[A,EDITOR]))[0].enabled,true);
 await denied(()=>grant(A,EDITOR,false,false),/editor_permission_conflict/);
 await denied(()=>grant(A,ADMIN,true,false),/invalid_editor_request/);
 await denied(()=>grant(A,OTHER,true,false),/staff_member_required/);
 await as(EDITOR);eq((await rows('select private.is_org_admin($1) yes',[A]))[0].yes,false,'editor is never an administrator');for(const feature of ['handoff_settings','resident_info','meal_settings','assignment_settings'])eq((await rows('select private.can_edit_facility($1,$2) yes',[A,feature]))[0].yes,true,feature);
 eq((await rows("select private.can_edit_facility($1,'role_management') yes",[A]))[0].yes,false);
 await denied(()=>grant(A,STAFF,true,false),/admin_required/);
 await denied(()=>db.query("update public.organization_facility_editors set enabled=false where organization_id=$1",[A]),/permission denied/);
 await denied(()=>db.query("insert into public.organization_facility_editors values($1,$2,true,now(),$2)",[A,STAFF]),/permission denied/);
 await denied(()=>db.query("update public.organization_members set role='admin' where organization_id=$1 and user_id=$2",[A,EDITOR]),/permission denied/);
 for(const [rpc,params]of [['set_organization_member_role',[A,STAFF,'admin']],['remove_organization_staff',[A,STAFF]],['list_organization_staff',[A]]])await denied(()=>db.query('select public.'+rpc+'('+params.map((_,i)=>'$'+(i+1)).join(',')+')',params),/admin_required/);
 await denied(()=>db.query('select * from private.facility_permission_history'),/permission denied/);
 await denied(()=>db.query('select * from private.facility_edit_history'),/permission denied/);
 // A: items, categories and deletion touch only the quick-input configuration.
 await db.query("insert into public.handoff_quick_inputs(organization_id,label,category) values($1,'追加項目','体調')",[A]);
 eq((await rows("update public.handoff_quick_inputs set label='編集済み',category='服薬' where id=$1 returning id",[Q])).length,1);
 await db.query("delete from public.handoff_quick_inputs where label='追加項目' and organization_id=$1",[A]);

 // B: same resident ID, only basic fields; no transfers, retirement, sensitive fields or old-record deletion.
 eq((await rows("update public.clients set display_name='基本情報変更',room_number='103' where id=$1 returning id",[CA])).length,1);
 for(const patch of ["usual='機微情報'","caution='機微情報'","support_method='機微情報'","care_intro_text='機微情報'","is_active=false","id='"+id(99)+"'","code='identity-change'"])
  await denied(()=>db.query('update public.clients set '+patch+' where id=$1',[CA]),/immutable|invalid_resident/);
 await denied(()=>db.query('update public.clients set organization_id=$1 where id=$2',[B,CA]),/immutable/);
 await denied(()=>db.query('update public.clients set organization_id=$1 where id=$2',[A,CB]),/immutable/);
 eq((await rows("update public.clients set display_name='旧利用者変更' where id=$1 returning id",[RETIRED])).length,0);
 eq((await rows('delete from public.clients where id=$1 returning id',[CA])).length,0);
 await denied(()=>db.query("insert into public.clients(organization_id,code,display_name,room_number,usual) values($1,'bad','機微','104','機微')",[A]),/resident_basic/);
 const inserted=await rows("insert into public.clients(organization_id,code,display_name,room_number) values($1,'new-resident','新規利用者','104') returning id",[A]);eq(inserted.length,1);
 // C: profiles never rewrite past servings, snapshots or prices.
 const servings=await rows('select * from public.meal_entries where organization_id=$1',[A]);
 await db.query("update public.meal_profiles set food_form='刻み食',rice_morning=200,note='食事の注意事項' where client_id=$1",[CA]);
 eq((await rows('select rice_morning from public.meal_profiles where client_id=$1',[CA]))[0].rice_morning,200);
 eq(await rows('select * from public.meal_entries where organization_id=$1',[A]),servings,'profile edits preserve served history and billable snapshots');
 await denied(()=>db.query('update public.meal_profiles set organization_id=$1 where client_id=$2',[B,CA]),/immutable/);
 await denied(()=>db.query('update public.meal_profiles set client_id=$1 where client_id=$2',[inserted[0].id,CA]),/immutable/);
 eq((await rows('update public.meal_prices set morning=999 where organization_id=$1 returning organization_id',[A])).length,0);
 await denied(()=>db.query('insert into public.meal_prices(organization_id,effective_date,morning,lunch,evening) values($1,current_date+1,1,1,1)',[A]),/row.level security|facility_edit_required/);
 // D: atomic time replacement, non-destructive deactivation, exact ID and preset preservation.
 await db.query("select public.save_facility_service_times($1,$2,array['08:00','20:00']::time[],array['09:00']::time[])",[A,CA]);
 eq((await rows('select is_active from public.client_service_slots where id=$1',[SLOT]))[0].is_active,false);
 eq((await rows('select service_time from public.client_service_slots where organization_id=$1 and client_id=$2 and is_active order by sort_order',[A,CA])).map(r=>r.service_time),['20:00:00','08:00:00'],'night-to-next-morning ordering remains the existing orderMinute convention');
 await denied(()=>db.query("select public.save_facility_service_times($1,$2,array['09:00']::time[],array['09:00']::time[])",[A,CA]),/conflict/);
 await db.query("select public.save_facility_service_times($1,$2,array['09:00']::time[],array['08:00','20:00']::time[])",[A,CA]);
 const originalSlot=(await rows('select * from public.client_service_slots where id=$1',[SLOT]))[0];eq(originalSlot.is_active,true);eq(originalSlot.service_contents,['食事介助']);
 await db.query("update public.client_service_slots set service_contents='[\"口腔ケア\"]' where id=$1",[SLOT]);
 await denied(()=>db.query('update public.client_service_slots set organization_id=$1,client_id=$2 where id=$3',[B,CB,SLOT]),/immutable/);
 eq((await rows('delete from public.client_service_slots where id=$1 returning id',[SLOT])).length,0);
 await denied(()=>db.query("select public.save_facility_service_times($1,$2,array['10:00']::time[],array[]::time[])",[A,CB]),/active_client/);
 // Other facility users have no new rights in A, even when administrators elsewhere.
 await as(OTHER);eq((await rows('select * from public.clients where organization_id=$1',[A])).length,0);
 await denied(()=>db.query("insert into public.handoff_quick_inputs(organization_id,label) values($1,'他施設')",[A]),/row.level security|facility_edit_required/);
 await denied(()=>grant(A,STAFF,true,false),/admin_required/);
 await as(STAFF);for(const f of ['handoff_settings','resident_info','meal_settings','assignment_settings'])eq((await rows('select private.can_edit_facility($1,$2) yes',[A,f]))[0].yes,false);
 await denied(()=>db.query("insert into public.clients(organization_id,code) values($1,'staff')",[A]),/facility_edit_required|row.level security/);
 await denied(()=>db.query("insert into public.handoff_quick_inputs(organization_id,label) values($1,'staff')",[A]),/facility_edit_required|row.level security/);
 await denied(()=>db.query("select public.save_facility_service_times($1,$2,array['10:00']::time[],array['09:00']::time[])",[A,CA]),/facility_edit_required/);
 eq((await rows('select * from public.organization_facility_editors where organization_id=$1',[A])).length,0,'staff cannot inspect colleagues permissions');
 // Preserve every existing protected record and organization role before deliberately exercising legacy operations.
 const protectedTables=['organization_members','organization_staff','staff_assignments','care_records','handoff_entries','handoff_confirmations','handoff_activity','meal_entries','meal_prices'];
 const after=await snapshot(protectedTables);for(const t of protectedTables)eq(after[t],before[t],t+' preserved');
 const audit=await rows('select * from private.facility_edit_history');eq(audit.length>5,true);eq(audit.every(r=>r.actor_user_id===EDITOR&&r.organization_id===A),true);
 await as(ADMIN);eq((await rows('select * from public.list_organization_staff($1)',[A])).length,3);
 await grant(A,EDITOR,false,true);
 await as(EDITOR);for(const f of ['handoff_settings','resident_info','meal_settings','assignment_settings'])eq((await rows('select private.can_edit_facility($1,$2) yes',[A,f]))[0].yes,false,'revocation is effective in the same session');
 eq((await rows("update public.clients set display_name='解除後' where id=$1 returning id",[CA])).length,0);
 eq((await rows("update public.handoff_quick_inputs set label='解除後' where id=$1 returning id",[Q])).length,0);
 eq((await rows('update public.meal_profiles set rice_morning=999 where client_id=$1 returning client_id',[CA])).length,0);
 await denied(()=>db.query("select public.save_facility_service_times($1,$2,array['10:00']::time[],array['09:00']::time[])",[A,CA]),/facility_edit_required/);
 // User-approved compatibility: ordinary assignment/memo edits remain the original member operation.
 eq((await rows("update public.staff_assignments set memo='解除後も従来の一般操作',updated_by=$1 where id=$2 returning id",[EDITOR,AS])).length,1);
 await as(STAFF);eq((await rows("update public.staff_assignments set memo='一般職員の既存操作',updated_by=$1 where id=$2 returning id",[STAFF,AS])).length,1);
 // Existing admin writes still work, including sensitive fields unavailable to editors.
 await as(ADMIN);eq((await rows("update public.clients set caution='既存管理者操作' where id=$1 returning id",[CA])).length,1);
 await grant(A,EDITOR,true,false);await db.query('select public.set_organization_member_role($1,$2,$3)',[A,EDITOR,'admin']);
 eq((await rows('select enabled from public.organization_facility_editors where organization_id=$1 and user_id=$2',[A,EDITOR]))[0].enabled,false,'promotion clears latent editor permission');
 await db.query('select public.set_organization_member_role($1,$2,$3)',[A,EDITOR,'staff']);await as(EDITOR);eq((await rows("select private.can_edit_facility($1,'resident_info') yes",[A]))[0].yes,false,'demotion cannot resurrect old grant');
 await as(ADMIN);await grant(C,EDITOR,true,false);await owner();await db.query('update public.organizations set is_active=false where id=$1',[C]);await as(EDITOR);eq((await rows("select private.can_edit_facility($1,'resident_info') yes",[C]))[0].yes,false,'inactive facility denied');
 await as(ADMIN);await grant(A,EDITOR,true,false);await db.query('select public.remove_organization_staff($1,$2)',[A,EDITOR]);await owner();
 eq((await rows('select * from public.organization_facility_editors where organization_id=$1 and user_id=$2',[A,EDITOR])).length,0,'membership unlink clears editor record');
 eq((await rows("select count(*)::int n from private.facility_permission_history where reason='membership_removed'"))[0].n,1,'audit survives unlink');
 await db.query("insert into public.organization_members(organization_id,user_id,role,staff_name) values($1,$2,'staff','再参加職員')",[A,EDITOR]);await as(EDITOR);
 eq((await rows("select private.can_edit_facility($1,'resident_info') yes",[A]))[0].yes,false,'rejoining does not resurrect permission');
 await as(null,'anon');await denied(()=>db.query('select public.set_facility_editor($1,$2,true,false)',[A,STAFF]),/permission denied/);
 await owner();eq((await rows("select pg_get_constraintdef(oid) d from pg_constraint where conname='organization_members_role_check'"))[0].d.includes("'admin'"),true);
 eq((await rows('select count(*)::int n from private.facility_permission_history'))[0].n>=5,true);
 eq((await rows("select relrowsecurity from pg_class where oid='public.organization_facility_editors'::regclass"))[0].relrowsecurity,true);
 eq((await rows("select count(*)::int n from pg_proc where proname in ('set_facility_editor','save_facility_service_times') and pronamespace='public'::regnamespace and prosecdef"))[0].n,0,'no new privileged public RPCs');
 await db.query("update public.clients set caution='既存の信頼された保守処理' where id=$1",[CA]);checks++;
 console.log(`PASS facility-editor DB: ${checks} assertions; exact schema/roles, four features, self escalation, cross-org mixed roles, immutable IDs, served billing, atomic times, revocation, audit and legacy staff/admin`);

}catch(error){console.error(error.message,error.detail);throw error;}finally{await db.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
