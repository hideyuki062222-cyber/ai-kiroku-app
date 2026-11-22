const fs=require('node:fs'),path=require('node:path');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ids=Object.fromEntries(Object.entries({A:1,B:2,ADMIN:11,STAFF:12,EDITOR:13,OTHER:14,CA:21,CB:22,REC:51}).map(([k,v])=>[k,id(v)]));
async function setup(db,apply=true){
 const {A,B,ADMIN,STAFF,EDITOR,OTHER,CA,CB,REC}=ids;
 await db.exec(fs.readFileSync('tests/fixtures/facility_editor_schema.sql','utf8'));await db.exec(fs.readFileSync('tests/fixtures/scoped_permissions_schema.sql','utf8'));
 for(const f of fs.readdirSync('supabase/migrations').filter(f=>f>='20261115235721'&&f<'20261119144626'))await db.exec(fs.readFileSync(path.join('supabase/migrations',f),'utf8'));
 for(const uid of [ADMIN,STAFF,EDITOR,OTHER])await db.query('insert into auth.users values($1,$2)',[uid,uid+'@example.invalid']);
 for(const [org,actor]of [[A,ADMIN],[B,OTHER]]){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.query("insert into public.organizations(id,name,join_code,created_by) values($1,'架空施設',$2,$3)",[org,org,actor]);}
 for(const [org,user,role]of [[A,ADMIN,'admin'],[A,STAFF,'staff'],[A,EDITOR,'staff'],[B,OTHER,'admin'],[B,STAFF,'staff'],[B,EDITOR,'staff']])await db.query("insert into public.organization_members(organization_id,user_id,role,staff_name) values($1,$2,$3,'架空職員')",[org,user,role]);
 for(const [client,org,actor]of [[CA,A,ADMIN],[CB,B,OTHER]]){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.query("insert into public.clients(id,organization_id,code,display_name,is_active,room_number,usual,communication,support_method) values($1,$2,$3,'架空利用者',true,'101','普段の参考情報','ゆっくり話す','以前の支援方法')",[client,org,'resident-'+(client===CA?'101':'201')]);}
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ADMIN]);await db.query('select public.set_facility_editor($1,$2,true,false)',[A,EDITOR]);
 await db.query("insert into public.care_records(id,organization_id,client_id,created_by,visit_note,care_note) values($1,$2,$3,$4,'保持する過去の観察','保持する過去の支援')",[REC,A,CA,ADMIN]);
 await db.exec(fs.readFileSync('supabase/migrations/20261120051058_safe_granular_facility_permissions.sql','utf8'));
 if(apply)await db.exec(fs.readFileSync('supabase/migrations/20261122003150_resident_routine_care.sql','utf8'));
 return ids;
}
module.exports={setup,ids,id};
