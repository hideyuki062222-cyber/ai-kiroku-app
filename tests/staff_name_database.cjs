// Actual Postgres (PGlite), synthetic data only. Never connects to Supabase.
const {PGlite}=require(process.env.PGLITE_PATH||'@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [A,B,C,admin,user,other,outsider,offline]=[1,2,3,11,12,13,14,21].map(uuid);
(async()=>{
 const db=new PGlite();let checks=0;
 const exec=sql=>db.exec(sql),query=async(sql,args=[])=> (await db.query(sql,args)).rows;
 const check=(value,message)=>{assert(value,message);checks++};
 const as=async(id,role='authenticated')=>{await exec(`reset role;set role ${role};`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||''])};
 const denied=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++};
 try{
  await exec(fs.readFileSync(path.join(root,'tests/fixtures/staff_names_schema.sql'),'utf8'));
  await db.query('insert into auth.users(id,email) select x, x::text||\'@example.invalid\' from unnest($1::uuid[]) x',[[admin,user,other,outsider]]);
  await db.query("insert into public.organizations values($1,'A',true),($2,'B',true),($3,'Stopped',false)",[A,B,C]);
  await db.query(`insert into public.organization_members(organization_id,user_id,role,staff_name) values
   ($1,$4,'admin','管理者'),($1,$5,'staff','同姓同名'),($1,$6,'staff','同姓同名'),
   ($2,$5,'staff','施設Bの氏名'),($2,$7,'admin','他施設管理者'),($3,$4,'admin','停止施設の管理者')`,[A,B,C,admin,user,other,outsider]);
  await db.query("insert into public.organization_staff(id,organization_id,staff_name,created_by) values($1,$2,'ログインなし職員',$3)",[offline,A,admin]);
  await exec(fs.readFileSync(path.join(root,'supabase/attendance_setup.sql'),'utf8'));
  // Reproduce original divergence BEFORE installing the fix.
  await db.query("update public.organization_staff set staff_name='氏名未設定' where organization_id=$1 and linked_user_id=$2",[A,user]);
  await db.query("update public.organization_staff set staff_name='旧氏名' where organization_id=$1 and linked_user_id=$2",[A,other]);
  const staffId=(await query('select id from public.organization_staff where organization_id=$1 and linked_user_id=$2',[A,user]))[0].id;
  const otherStaff=(await query('select id from public.organization_staff where organization_id=$1 and linked_user_id=$2',[A,other]))[0].id;
  const orgBStaff=(await query('select id from public.organization_staff where organization_id=$1 and linked_user_id=$2',[B,user]))[0].id;
  // Existing records depend on IDs, not display-name matching.
  await exec(`create table public.staff_assignments(id uuid primary key,organization_id uuid,assigned_user_id uuid,assigned_staff_id uuid,assigned_staff_name text,
    foreign key(assigned_staff_id,organization_id) references public.organization_staff(id,organization_id));
    create table public.care_records(id uuid primary key,organization_id uuid,created_by uuid,staff_name text);
    create table public.clients(id uuid primary key,organization_id uuid,display_name text);`);
  await db.query("insert into public.staff_assignments values($1,$2,$3,$4,'当時の氏名')",[uuid(31),A,user,staffId]);
  await db.query("insert into public.care_records values($1,$2,$3,'当時の記録者')",[uuid(32),A,user]);
  await db.query("insert into public.clients values($1,$2,'利用者')",[uuid(33),A]);
  await as(admin);const days=Array.from({length:31},()=>({t:'',s:null,e:null,b:0,g:'',h:'',night:''}));
  for(const id of [staffId,otherStaff,offline])await db.query("insert into public.attendance_months(organization_id,staff_id,period,rows,memo) values($1,$2,'2026-11-01',$3,'既存の勤務記録')",[A,id,JSON.stringify(days)]);
  await exec('reset role');
  const snapshot=async tables=>{const out={};for(const table of tables)out[table]=await query(`select to_jsonb(t) data from public.${table} t order by to_jsonb(t)::text`);return out};
  const protectedTables=['attendance_months','staff_assignments','care_records','clients'];
  const before=await snapshot(['organization_staff','organization_members',...protectedTables]);
  const policies=await query("select * from pg_policies where schemaname='public' order by tablename,policyname");
  await exec(fs.readFileSync(path.join(root,'supabase/migrations/20261113013000_staff_name_consistency.sql'),'utf8'));
  assert.deepEqual(await snapshot(Object.keys(before)),before);checks++;
  assert.deepEqual(await query("select * from pg_policies where schemaname='public' order by tablename,policyname"),policies);checks++;
  await as(admin);
  const directory=await query('select * from public.organization_staff_directory');
  check(directory.every(r=>[A,C].includes(r.organization_id)),'invoker view preserves membership RLS');
  check(directory.find(r=>r.id===staffId).staff_name==='同姓同名','old placeholder resolves via canonical member');
  check(directory.find(r=>r.id===otherStaff).staff_name==='同姓同名','old master name resolves without rewriting row');
  check(directory.find(r=>r.id===offline).staff_name==='ログインなし職員','offline source preserved');
  const manage=await query('select * from public.list_organization_staff($1)',[A]);
  check(manage.find(r=>r.user_id===user).staff_name===directory.find(r=>r.id===staffId).staff_name,'both pages use same source');
  const rename=(org,id,name,expectedUser,expectedName)=>db.query('select * from public.rename_organization_staff($1,$2,$3,$4,$5)',[org,id,name,expectedUser,expectedName]);
  const saved=(await rename(A,staffId,'　変更した氏名\u200B ',user,'同姓同名')).rows;
  check(saved.length===1&&saved[0].id===staffId&&saved[0].linked_user_id===user&&saved[0].staff_name==='変更した氏名','admin rename returns verified identity');
  check((await query('select staff_name from public.organization_members where organization_id=$1 and user_id=$2',[A,user]))[0].staff_name==='変更した氏名','canonical name persisted');
  check((await query('select staff_name from public.organization_staff where id=$1',[staffId]))[0].staff_name==='変更した氏名','only target cache synchronized');
  check((await query('select staff_name from public.organization_members where organization_id=$1 and user_id=$2',[A,other]))[0].staff_name==='同姓同名','same-name other user untouched');
  await denied(()=>rename(A,staffId,'stale',user,'同姓同名'),/staff_name_changed/);
  await denied(()=>rename(A,staffId,'wrong identity',other,'変更した氏名'),/staff_identity_changed/);
  await denied(()=>rename(A,orgBStaff,'wrong org',user,'施設Bの氏名'),/staff_not_found/);
  for(const value of ['', '　\u200B ', '氏名未設定','あ'.repeat(81)])await denied(()=>rename(A,staffId,value,user,'変更した氏名'),/invalid_staff_name/);
  await denied(()=>rename(C,(directory.find(r=>r.organization_id===C)).id,'stopped',admin,'停止施設の管理者'),/organization_inactive/);
  await denied(()=>db.query('update public.organization_staff set staff_name=$1 where id=$2',['旧画面の保存',staffId]),/use_canonical_staff_name_update/);
  check((await rename(A,offline,'代理入力職員の新氏名',null,'ログインなし職員')).rows[0].staff_name==='代理入力職員の新氏名','offline admin rename');
  // Normal name registration path, including same auth ID with a different facility name.
  await as(user);
  await db.query('update public.organization_members set staff_name=$1 where organization_id=$2 and user_id=$3',['本人による変更',A,user]);
  check((await query('select staff_name from public.organization_staff_directory where id=$1',[staffId]))[0].staff_name==='本人による変更','self edit visible after fresh query');
  check((await query('select staff_name from public.organization_staff_directory where id=$1',[orgBStaff]))[0].staff_name==='施設Bの氏名','join includes organization ID');
  check((await query('select staff_name from public.organization_staff where id=$1',[staffId]))[0].staff_name==='本人による変更','self edit sync persisted');
  await db.query("update public.organization_members set staff_name='' where organization_id=$1 and user_id=$2",[A,user]);
  check((await query('select staff_name from public.organization_staff_directory where id=$1',[staffId]))[0].staff_name==='','unregistered canonical name does not borrow an old or other-person name');
  await db.query('update public.organization_members set staff_name=$1 where organization_id=$2 and user_id=$3',['本人による変更',A,user]);
  check((await query('select staff_name from public.organization_staff where id=$1',[staffId]))[0].staff_name==='本人による変更','first registration uses the same sync path');
  await denied(()=>rename(A,staffId,'unauthorized',user,'本人による変更'),/admin_required/);
  await denied(()=>db.query("update public.organization_members set role='admin' where organization_id=$1 and user_id=$2",[A,user]),/permission denied/);
  check((await db.query('update public.organization_members set staff_name=$1 where organization_id=$2 and user_id=$3',['別人を改名',A,other])).affectedRows===0,'member cannot rename others');
  check((await db.query('update public.organization_staff set linked_user_id=$1 where id=$2',[user,otherStaff])).affectedRows===0,'member cannot relink staff');
  check((await query('select * from public.attendance_months')).length===1,'attendance still self-only');
  await as(null,'anon');
  await denied(()=>query('select * from public.organization_staff_directory'),/permission denied/);
  await denied(()=>rename(A,staffId,'anon',user,'本人による変更'),/permission denied/);
  await as(outsider);
  check((await query('select * from public.organization_staff_directory where organization_id=$1',[A])).length===0,'other-org admin cannot read through view');
  await denied(()=>rename(A,staffId,'cross-org',user,'本人による変更'),/admin_required/);
  // Relogin uses persisted canonical data, never user_metadata or a local name cache.
  await as(null);await denied(()=>rename(A,staffId,'no sub',user,'本人による変更'),/not_authenticated/);
  await as(user);
  check((await query('select staff_name from public.organization_staff_directory where id=$1',[staffId]))[0].staff_name==='本人による変更','logout/relogin preserves name');
  await as(admin);
  check((await query('select * from public.list_organization_staff($1)',[A])).find(r=>r.user_id===user).staff_name==='本人による変更','manage agrees after self edit');
  // Existing admin identity controls continue to work without changing staff IDs.
  await db.query('update public.organization_staff set linked_user_id=null where id=$1',[otherStaff]);
  check((await query('select * from public.organization_staff_directory where id=$1',[otherStaff]))[0].staff_name==='同姓同名','unlink snapshots canonical name, not stale cache');
  const temporary=(await db.query("insert into public.organization_staff(organization_id,linked_user_id,staff_name,created_by) values($1,$2,'氏名未設定',$3) returning id,staff_name",[A,other,admin])).rows[0];
  check(temporary.staff_name==='同姓同名','new linked row canonicalizes on insert');
  await db.query('delete from public.organization_staff where id=$1',[temporary.id]);
  await db.query('update public.organization_staff set linked_user_id=$1 where id=$2',[other,otherStaff]);
  await denied(()=>db.query('update public.organization_staff set linked_user_id=$1 where id=$2',[outsider,offline]),/linked_member_missing/);
  // Simulate existing SECURITY DEFINER remove-member operation, retaining auth.uid for authorization.
  await exec('reset role');
  await db.query('delete from public.organization_members where organization_id=$1 and user_id=$2',[A,user]);
  const detached=(await query('select * from public.organization_staff_directory where id=$1',[staffId]))[0];
  check(detached.id===staffId&&detached.linked_user_id===null&&detached.staff_name==='本人による変更','member removal keeps staff/history and last name');
  assert.deepEqual(await snapshot(protectedTables),Object.fromEntries(protectedTables.map(t=>[t,before[t]])));checks++;
  const staffIdentity=({staff_name,updated_at,...identity})=>identity;
  const afterStaff=(await snapshot(['organization_staff'])).organization_staff.map(r=>staffIdentity(r.data)).sort((a,b)=>a.id.localeCompare(b.id));
  const priorStaff=before.organization_staff.map(r=>staffIdentity({...r.data,linked_user_id:r.data.id===staffId?null:r.data.linked_user_id})).sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(afterStaff,priorStaff);checks++;
  const membersAfter=await query('select organization_id,user_id,role from public.organization_members order by organization_id,user_id');
  const membersBefore=before.organization_members.map(r=>r.data).filter(r=>r.organization_id!==A||r.user_id!==user).map(({organization_id,user_id,role})=>({organization_id,user_id,role})).sort((a,b)=>a.organization_id.localeCompare(b.organization_id)||a.user_id.localeCompare(b.user_id));
  assert.deepEqual(membersAfter,membersBefore);checks++;
  const security=await query("select n.nspname,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('rename_organization_staff','rename_staff_canonical','sync_member_staff_name','canonicalize_linked_staff_name')");
  check(security.length===4&&security.every(r=>r.nspname==='private'||!r.prosecdef),'no exposed SECURITY DEFINER added');
  check(security.every(r=>r.proconfig.includes('search_path=""')),'all added entrypoints have empty search_path');
  const view=(await query("select reloptions from pg_class where oid='public.organization_staff_directory'::regclass"))[0];
  check(view.reloptions.includes('security_invoker=true'),'directory cannot bypass base RLS');
  check(!(await query("select has_table_privilege('authenticated','public.organization_staff_directory','UPDATE') allowed"))[0].allowed,'directory is read-only');
  console.log(`PASS staff-name database: ${checks} assertions; migration, canonical reads, persistence, CAS, RLS, identities, records and attendance`);
 }finally{await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
