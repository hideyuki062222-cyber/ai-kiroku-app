const fs=require('node:fs');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ids=Object.fromEntries(Object.entries({A:1,B:2,ADMIN:11,LEGACY:12,STAFF:13,OTHER:14,TARGET:15,SECOND:16,CA:21,CB:22,RECORD:31,STAFFID:41,HANDOFF:51,CASH:61,CHOICE:62}).map(([k,v])=>[k,uuid(v)]));
const migration='supabase/migrations/20261119144626_granular_facility_permissions.sql';
async function setup(db,{migrate=true}={}){
 const q=async(s,p=[])=>{try{return await db.query(s,p);}catch(e){console.error('fixture query:',s);throw e;}},{A,B,ADMIN,LEGACY,STAFF,OTHER,TARGET,SECOND,CA,CB,RECORD,STAFFID,HANDOFF,CASH,CHOICE}=ids;
 await db.exec("set time zone 'Asia/Tokyo'");
 await db.exec(fs.readFileSync('tests/fixtures/facility_editor_schema.sql','utf8'));
 await db.exec(fs.readFileSync('tests/fixtures/scoped_permissions_schema.sql','utf8'));
 for(const f of fs.readdirSync('supabase/migrations').filter(f=>f>='20261115235721'&&f<'20261119144626'))await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 for(const uid of [ADMIN,LEGACY,STAFF,OTHER,TARGET,SECOND])await q('insert into auth.users values($1,$2)',[uid,uid+'@example.invalid']);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[ADMIN]);
 for(const org of [A,B])await q('insert into public.organizations(id,name,join_code,created_by) values($1,$2,$1::uuid::text,$3)',[org,org===A?'検証施設A':'検証施設B',ADMIN]);
 for(const [o,u,r]of [[A,ADMIN,'admin'],[A,LEGACY,'staff'],[A,STAFF,'staff'],[A,TARGET,'staff'],[A,SECOND,'staff'],[B,OTHER,'admin'],[B,LEGACY,'staff'],[B,TARGET,'staff']])await q('insert into public.organization_members(organization_id,user_id,role,staff_name) values($1,$2,$3,$4)',[o,u,r,u===STAFF||u===TARGET?'同姓同名（架空）':'架空職員'+u.slice(-2)]);
 for(const [cid,org]of [[CA,A],[CB,B]]){await q("select set_config('request.jwt.claim.sub',$1,false)",[org===A?ADMIN:OTHER]);await q("insert into public.clients(id,organization_id,code,display_name,room_number) values($1,$2,$1::uuid::text,'架空利用者','101')",[cid,org]);}
 await q("select set_config('request.jwt.claim.sub',$1,false)",[ADMIN]);
 await q("insert into public.organization_staff(id,organization_id,staff_name,linked_user_id,created_by) values($1,$2,'同姓同名（架空）',$3,$4)",[STAFFID,A,STAFF,ADMIN]);
 await q("insert into public.care_records(id,organization_id,client_id,created_by,service_date,service_time,visit_note,care_note) values($1,$2,$3,$4,current_date,'09:00','元の観察','指示内容確認しました。前回のサービス記録確認しました。元の支援')",[RECORD,A,CA,STAFF]);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[STAFF]);
 await q("insert into public.handoff_entries(id,organization_id,client_id,service_date,shift,body,created_by) values($1,$2,$3,current_date,'day','架空の申し送り',$4)",[HANDOFF,A,CA,STAFF]);
 await q('insert into public.handoff_confirmations(entry_id,user_id) values($1,$2)',[HANDOFF,STAFF]);
 await q("select set_config('request.jwt.claim.sub',$1,false)",[ADMIN]);
 await q('insert into public.meal_profiles(organization_id,client_id,start_date) values($1,$2,current_date-60)',[A,CA]);
 await q('insert into public.meal_prices(organization_id,effective_date,morning,lunch,evening) values($1,current_date,330,440,550)',[A]);
 await q("insert into public.meal_entries(organization_id,client_id,meal_date,meal,status) values($1,$2,current_date,'morning','served')",[A,CA]);
 await q("insert into public.cashbook_entries(id,organization_id,client_id,tx_date,kind,amount,item,store,created_by,updated_by) values($1,$2,$3,current_date,'expense',100,'架空支出','検証店',$4,$4)",[CASH,A,CA,ADMIN]);
 await q("insert into public.cashbook_choices(id,organization_id,kind,label,created_by) values($1,$2,'store','検証店',$3)",[CHOICE,A,ADMIN]);
 await db.exec('set role authenticated');await q('select public.set_facility_editor($1,$2,true,false)',[A,LEGACY]);await db.exec('reset role');
 if(migrate)await db.exec(fs.readFileSync(migration,'utf8'));
}
module.exports={setup,ids,uuid,migration};
