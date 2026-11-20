// Synthetic staff administration regression; shared with native PostgreSQL rehearsal.
// No network or real Auth users. UI/API operations run as authenticated, never owner.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {setup,ids,uuid,migration}=require('./scoped_fixture.cjs');

async function run(db,{migrationSql=fs.readFileSync(migration,'utf8')}={}){
 let checks=0;
 const {A,B,ADMIN,LEGACY,STAFF,OTHER,TARGET,SECOND,CA,STAFFID}=ids;
 const OFFLINE=uuid(601),LINKED=uuid(602),SECOND_STAFF=uuid(603),MOVABLE=uuid(604),DUAL=uuid(605),ASSIGNMENT=uuid(606);
 const q=async(sql,params=[])=>(await db.query(sql,params)).rows;
 const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
 const deny=async(fn,re=/denied|permission|row.level|admin_required|identity|member|self|role|foreign key|immutable|linked|not_authenticated/)=>{await assert.rejects(fn,re);checks++;};
 const as=async uid=>{await db.exec('reset role;set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]);};
 const owner=async()=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub','',false)");};
 const snapshot=async tables=>{const result={};for(const t of tables)result[t]=(await q('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),\'[]\'::jsonb) x from '+t+' t'))[0].x;return result;};
 const directory=async id=>(await q('select * from public.organization_staff_directory where id=$1',[id]))[0];
 const permissionSet=async uid=>(await q('select public.get_facility_permission_set($1,$2) x',[A,uid]))[0].x;
 const patch=async(uid,changes)=>{const rev=(await permissionSet(uid)).revision;return q('select public.set_facility_permissions($1,$2,$3,$4) x',[A,uid,rev,JSON.stringify(changes)]);};

 await setup(db,{migrate:false});await owner();
 // Reuse actual existing attendance DDL, omitting the already-applied staff integration.
 const attendance=fs.readFileSync('supabase/attendance_setup.sql','utf8');
 const marker='create function public.attendance_rows_valid(data jsonb)';
 assert.equal(attendance.split(marker).length,2);
 await db.exec('create schema attendance_backup;'+attendance.slice(attendance.indexOf(marker)));
 await q('insert into auth.users(id,email) values($1,$2)',[DUAL,'dual-admin@example.invalid']);
 for(const org of [A,B])await q("insert into public.organization_members(organization_id,user_id,role,staff_name) values($1,$2,'admin','両施設の管理者（架空）')",[org,DUAL]);
 await as(ADMIN);
 const rows=JSON.stringify(Array.from({length:31},()=>({t:'',s:null,e:null,b:0,g:'',h:'',night:''})));
 await q("insert into public.attendance_months(organization_id,staff_id,period,rows) values($1,$2,date '2099-01-01',$3)",[A,STAFFID,rows]);
 await q("insert into public.staff_assignments(id,organization_id,client_id,service_date,service_time,assigned_user_id,assigned_staff_id,assigned_staff_name,created_by,updated_by) values($1,$2,$3,current_date,'09:00',$4,$5,'保存済みの職員氏名（架空）',$6,$6)",[ASSIGNMENT,A,CA,STAFF,STAFFID,ADMIN]);
 await owner();
 const tables=(await q("select quote_ident(n.nspname)||'.'||quote_ident(c.relname) name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','attendance_backup','meal_history','auth') and c.relkind in ('r','p') order by 1")).map(r=>r.name);
 const allBefore=await snapshot(tables);
 await db.exec(migrationSql);
 eq(await snapshot(tables),allBefore,'migration keeps every existing business/Auth/membership/history row');
 const protectedTables=tables.filter(t=>!['public.organization_staff','public.organization_members','public.organization_facility_editors'].includes(t));
 const originalBusiness=await snapshot(protectedTables);
 const originalFlags=(await snapshot(['public.organization_facility_editors']))['public.organization_facility_editors'];
 const historical=await snapshot(['private.feature_permission_history','public.facility_operation_history']);

 // The two originally broken real admin paths: a bulk login roster INSERT and
 // linking an existing offline staff ID. Wrong input names must use canonical IDs.
 await as(ADMIN);
 const created=await q("insert into public.organization_staff(id,organization_id,staff_name,linked_user_id,created_by) values($1,$3,'古い仮氏名',$4,$6),($2,$3,'古い仮氏名',$5,$6) returning id,linked_user_id,staff_name",[LINKED,SECOND_STAFF,A,LEGACY,SECOND,ADMIN]);
 eq(created.map(r=>r.id).sort(),[LINKED,SECOND_STAFF].sort(),'admin bulk login staff creation succeeds');
 eq(created.find(r=>r.id===LINKED).staff_name,'架空職員12','linked name comes from exact membership');
 await q("insert into public.organization_staff(id,organization_id,staff_name,created_by) values($1,$2,'本人紐付け待ち（架空）',$3)",[OFFLINE,A,ADMIN]);
 const linked=await q("update public.organization_staff set linked_user_id=$1,office_label='施設A・表示変更',employment_type='常勤' where id=$2 and organization_id=$3 returning id,organization_id,linked_user_id,staff_name",[TARGET,OFFLINE,A]);
 eq(linked,[{id:OFFLINE,organization_id:A,linked_user_id:TARGET,staff_name:'同姓同名（架空）'}],'admin link keeps business staff ID and canonical identity');
 eq((await directory(OFFLINE)).office_label,'施設A・表示変更');
 const original=(await directory(STAFFID));
 const rename=await q("select * from public.rename_organization_staff($1,$2,'管理者が変更した氏名（架空）',$3,$4)",[A,STAFFID,STAFF,original.staff_name]);
 eq(rename[0].id,STAFFID);eq((await directory(STAFFID)).staff_name,'管理者が変更した氏名（架空）');
 eq((await q('select role from public.organization_members where organization_id=$1 and user_id=$2',[A,STAFF]))[0].role,'staff','profile edit does not change login role');
 eq((await directory(OFFLINE)).linked_user_id,TARGET,'same names never identify the other employee');
 await deny(()=>q('update public.organization_staff set linked_user_id=$1 where id=$2',[OTHER,OFFLINE]),/linked_member_missing|foreign key/);
 await deny(()=>q('update public.organization_staff set linked_user_id=$1 where id=$2',[STAFF,OFFLINE]),/unique|duplicate/);
 await q('update public.organization_staff set linked_user_id=null where id=$1',[OFFLINE]);
 eq((await directory(OFFLINE)).linked_user_id,null,'admin unlink succeeds');
 eq((await directory(OFFLINE)).staff_name,'同姓同名（架空）','unlink retains last verified name');
 await q('update public.organization_staff set linked_user_id=$1 where id=$2',[TARGET,OFFLINE]);
 eq((await directory(OFFLINE)).id,OFFLINE,'relink never recreates staff ID');
 await q('update public.organization_staff set linked_user_id=null where id=$1',[SECOND_STAFF]);
 await q('update public.organization_staff set linked_user_id=$1 where id=$2',[SECOND,OFFLINE]);
 eq((await directory(OFFLINE)).linked_user_id,SECOND,'admin can explicitly relink a different existing login');
 await q('update public.organization_staff set linked_user_id=$1 where id=$2',[TARGET,OFFLINE]);
 await q('update public.organization_staff set linked_user_id=$1 where id=$2',[SECOND,SECOND_STAFF]);
 eq((await directory(SECOND_STAFF)).id,SECOND_STAFF);

 // Facility ownership is not office_label. Existing USING and WITH CHECK must
 // validate both ends; no facility-transfer UI or new membership privilege added.
 await q("insert into public.organization_staff(id,organization_id,staff_name,created_by) values($1,$2,'未使用の移動確認職員（架空）',$3)",[MOVABLE,A,ADMIN]);
 await deny(()=>q('update public.organization_staff set organization_id=$1 where id=$2',[B,MOVABLE]),/row.level|permission/);
 await as(OTHER);
 eq(await q('update public.organization_staff set organization_id=$1 where id=$2 returning id',[B,MOVABLE]),[],'destination-only admin cannot access source facility');
 await as(DUAL);
 eq((await q('update public.organization_staff set organization_id=$1 where id=$2 returning id',[B,MOVABLE]))[0].id,MOVABLE,'existing both-facility admin check preserved');
 await q('update public.organization_staff set organization_id=$1 where id=$2',[A,MOVABLE]);
 await deny(()=>q('update public.organization_staff set organization_id=$1 where id=$2',[B,STAFFID]),/foreign key/);

 await as(ADMIN);await patch(TARGET,{staff_info:'full',resident_info:'full'});
 await as(TARGET);
 const person=await directory(STAFFID);
 const expected={staff_name:person.staff_name,linked_user_id:person.linked_user_id,office_label:person.office_label,employment_type:person.employment_type};
 await q("select public.edit_facility_staff_profile($1,$2,$3,'委任職員が変更した氏名（架空）','施設内の所属表示','非常勤')",[A,STAFFID,JSON.stringify(expected)]);
 eq((await directory(STAFFID)).linked_user_id,STAFF,'delegated display edit retains identity');
 eq((await directory(STAFFID)).office_label,'施設内の所属表示');
 eq((await directory(STAFFID)).organization_id,A,'office display is not facility ownership');
 await deny(()=>q("select public.edit_facility_staff_profile($1,$2,$3,'不正な変更','','')",[A,STAFFID,JSON.stringify({...expected,linked_user_id:TARGET})]),/identity_changed/);
 eq(await q('update public.organization_staff set linked_user_id=$1 where id=$2 returning id',[TARGET,STAFFID]),[],'delegate cannot self-link through direct API');
 eq(await q('update public.organization_staff set organization_id=$1 where id=$2 returning id',[B,OFFLINE]),[],'delegate cannot move facilities');
 await deny(()=>q("insert into public.organization_staff(organization_id,staff_name,linked_user_id,created_by) values($1,'勝手な職員追加',$2,$3)",[A,ADMIN,TARGET]));
 await deny(()=>q("update public.organization_members set role='admin' where organization_id=$1 and user_id=$2",[A,TARGET]));
 await deny(()=>q("select public.set_organization_member_role($1,$2,'admin')",[A,TARGET]),/admin_required/);
 await deny(()=>q('select public.remove_organization_staff($1,$2)',[A,STAFF]),/admin_required/);
 await deny(()=>q("select public.set_facility_permissions($1,$2,0,'{}')",[A,TARGET]),/admin_required/);
 await deny(()=>q("select public.rename_organization_staff($1,$2,'他施設操作',$3,'x')",[B,STAFFID,STAFF]),/required/);

 await as(STAFF);
 eq(await q("update public.organization_staff set linked_user_id=$1 where id=$2 returning id",[STAFF,OFFLINE]),[],'ordinary employee cannot claim another staff identity');
 await deny(()=>q("insert into public.organization_staff(organization_id,staff_name,created_by) values($1,'勝手な追加',$2)",[A,STAFF]));
 await deny(()=>q("select public.rename_organization_staff($1,$2,'勝手な氏名変更',$3,'x')",[A,OFFLINE,TARGET]),/required/);
 await deny(()=>q("select public.set_organization_member_role($1,$2,'admin')",[A,STAFF]),/admin_required/);
 await deny(()=>q('select public.remove_organization_staff($1,$2)',[A,TARGET]),/admin_required/);
 eq((await q('select staff_id from public.attendance_months')),[{staff_id:STAFFID}],'original employee still accesses own attendance');

 await as(ADMIN);
 await patch(TARGET,{staff_info:null});eq((await permissionSet(TARGET)).permissions,{resident_info:'full'},'revoking staff edit retains unrelated permissions');
 await as(TARGET);await deny(()=>q("select public.edit_facility_staff_profile($1,$2,$3,'解除後の操作','','')",[A,STAFFID,JSON.stringify(expected)]),/required/);
 await as(ADMIN);
 await q("select public.set_organization_member_role($1,$2,'admin')",[A,SECOND]);
 eq((await q('select role from public.organization_members where organization_id=$1 and user_id=$2',[A,SECOND]))[0].role,'admin');
 await q("select public.set_organization_member_role($1,$2,'staff')",[A,SECOND]);
 eq((await q('select role from public.organization_members where organization_id=$1 and user_id=$2',[A,SECOND]))[0].role,'staff');
 await deny(()=>q("select public.set_organization_member_role($1,$2,'staff')",[A,ADMIN]),/self/);
 await deny(()=>q("select public.set_organization_member_role($1,$2,'admin')",[B,LEGACY]),/admin_required/);
 await q('select public.remove_organization_staff($1,$2)',[A,SECOND]);
 eq((await directory(SECOND_STAFF)).id,SECOND_STAFF,'membership removal preserves staff row');
 eq((await directory(SECOND_STAFF)).linked_user_id,null,'only target login link cleared');
 eq((await directory(LINKED)).linked_user_id,LEGACY,'unrelated employee link retained');
 eq((await permissionSet(LEGACY)).permissions,{resident_info:'legacy',handoff_settings:'legacy',meal_settings:'legacy',assignment_settings:'legacy'},'legacy editor still owns original four only');

 await owner();
 eq(await snapshot(protectedTables),originalBusiness,'records, handoff, assignments, meals, attendance, cashbook and old histories unchanged by staff operations');
 const flags=(await snapshot(['public.organization_facility_editors']))['public.organization_facility_editors'];
 for(const row of originalFlags)eq(flags.some(r=>JSON.stringify(r)===JSON.stringify(row)),true,'unrelated legacy permission flag remains unchanged');
 const newHistory=await snapshot(Object.keys(historical));
 for(const table of Object.keys(historical))for(const row of historical[table])eq(newHistory[table].some(r=>JSON.stringify(r)===JSON.stringify(row)),true,'existing history retained');
 eq((await q("select relrowsecurity from pg_class where oid='public.organization_staff'::regclass"))[0].relrowsecurity,true);
 eq((await q("select relrowsecurity from pg_class where oid='public.organization_members'::regclass"))[0].relrowsecurity,true);
 eq((await q("select prosecdef,proconfig from pg_proc where oid='private.canonicalize_linked_staff_name()'::regprocedure"))[0],{prosecdef:true,proconfig:['search_path=""']});
 eq((await q("select has_function_privilege('authenticated','private.canonicalize_linked_staff_name()','EXECUTE') x"))[0].x,false);
 eq((await q("select prosecdef from pg_proc where oid='public.rename_organization_staff(uuid,uuid,text,uuid,text)'::regprocedure"))[0].prosecdef,false);
 await as('');
 eq(await q('update public.organization_staff set linked_user_id=$1 where id=$2 returning id',[ADMIN,OFFLINE]),[],'authenticated role without a user ID gains no identity write');
 await deny(()=>q("select public.rename_organization_staff($1,$2,'未認証操作',$3,'x')",[A,STAFFID,STAFF]),/not_authenticated/);
 await db.exec('set role anon');await deny(()=>q('select * from public.organization_staff'));
 await deny(()=>q("select public.rename_organization_staff($1,$2,'匿名操作',$3,'x')",[A,STAFFID,STAFF]));
 return {checks,migration_preservation_tables:tables.length,passed:true};
}

module.exports={run};
if(require.main===module){const {PGlite}=require(process.env.PGLITE_PATH||'@electric-sql/pglite');(async()=>{const db=new PGlite();try{console.log('PASS scoped staff administration:',JSON.stringify(await run(db)));}finally{await db.close();}})().catch(e=>{console.error(e.message,e.where,e.stack);process.exitCode=1;});}
