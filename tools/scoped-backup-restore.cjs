// Confidential rows stay in process memory and the in-memory local Postgres only.
// This script never connects to production and never prints row contents or IDs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {parseBackup}=require('./scoped-backup-data.cjs');
const packagePath=process.env.PGLITE_PATH||'@electric-sql/pglite';
const {PGlite}=require(packagePath);
const {pgcrypto}=require(path.isAbsolute(packagePath)?path.join(packagePath,'dist/contrib/pgcrypto.cjs'):'@electric-sql/pglite/contrib/pgcrypto');
const repo=fs.realpathSync(path.resolve(__dirname,'..')),input=process.env.NEXIA_BACKUP_DIR;
if(!input||!path.isAbsolute(input))throw Error('NEXIA_BACKUP_DIR must be an absolute protected directory outside the repository');
const root=fs.realpathSync(input);
if(!path.relative(repo,root).startsWith('..'))throw Error('Backups and restore keys must stay outside the repository');
if(!/^[a-f0-9]{64}$/.test(process.env.NEXIA_BACKUP_SHA256||''))throw Error('Set the SHA256 recorded independently when the encrypted backup was captured');
const ident=s=>'"'+s.replaceAll('"','""')+'"',qual=(s,t)=>ident(s)+'.'+ident(t);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hashRows=rows=>crypto.createHash('sha256').update(JSON.stringify(rows.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en')))).digest('hex');
let stage='decrypt',db;
async function acl(target,aclText,kind,column=null){
 const defaults={schema:'UC',table:'arwdDxtm',function:'X'};
 const codes={a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN',U:'USAGE',C:'CREATE',X:'EXECUTE'};
 await db.exec(`revoke all on ${kind} ${target} from public,anon,authenticated,service_role`);
 if(!aclText){if(kind==='function')await db.exec(`grant execute on function ${target} to public`);return;}
 for(const entry of aclText.slice(1,-1).split(',')){
  const match=entry.replaceAll('"','').match(/^([^=]*)=([^/]+)\//);if(!match)continue;
  const role=match[1]?ident(match[1]):'public',rights=match[2];
  for(let i=0;i<rights.length;i++){if(rights[i]==='*')continue;const right=codes[rights[i]];if(!right)throw Error('Unknown ACL privilege');
   const withGrant=rights[i+1]==='*'?' with grant option':'';
   await db.exec(`grant ${right}${column?' ('+ident(column)+')':''} on ${kind} ${target} to ${role}${withGrant}`);
  }
 }
}
(async()=>{
 if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'app-backup.gpg'))).digest('hex')!==process.env.NEXIA_BACKUP_SHA256)throw Error('Encrypted backup hash mismatch');
 const decrypt=cp.spawnSync('gpg',['--homedir',path.join(root,'keyring'),'--batch','--pinentry-mode','loopback','--passphrase-file',path.join(root,'restore-passphrase'),'--decrypt',path.join(root,'app-backup.gpg')],{maxBuffer:64*1024*1024});
 if(decrypt.status!==0)throw Error('Encrypted backup integrity or decryption failure');
 const payload=parseBackup(decrypt.stdout);
 if(payload.format!=='nexia-encrypted-logical-backup-v1'||payload.project!=='pagamoaxhqszojxrpxyu')throw Error('Unexpected backup format or project');
 const m=payload.schema_catalog,tables=m.relations.filter(t=>['r','p'].includes(t.kind));
 const before={};for(const [key,rows]of Object.entries(payload.tables))before[key]={rows:rows.length,hash:hashRows(rows)};
 db=new PGlite({extensions:{pgcrypto}});
 await db.exec("create schema extensions;create extension pgcrypto with schema extensions;set search_path=public,extensions;");
 stage='bootstrap';await db.exec("set time zone 'UTC';set check_function_bodies=off;create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role supabase_admin nologin;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid() to public;");
 for(const s of m.schemas)await db.exec('create schema if not exists '+ident(s.name));
 for(const t of tables){stage='table '+t.schema+'.'+t.name;const cols=m.columns.filter(c=>c.schema===t.schema&&c.table===t.name).sort((a,b)=>a.number-b.number);
  const parts=cols.map(c=>ident(c.name)+' '+c.type+(c.identity?' generated '+(c.identity==='a'?'always':'by default')+' as identity':'')+(c.notnull?' not null':''));
  await db.exec('create table '+qual(t.schema,t.name)+'('+parts.join(',')+')');
 }
 stage='functions';for(const f of m.functions)await db.exec(f.def);
 stage='views';for(const v of m.relations.filter(t=>t.kind==='v'))await db.exec('create view '+qual(v.schema,v.name)+(v.options?.length?' with ('+v.options.join(',')+')':'')+' as '+v.view);
 stage='defaults';for(const c of m.columns.filter(c=>c.default&&!c.identity&&!c.generated))if(tables.some(t=>t.schema===c.schema&&t.name===c.table))await db.exec('alter table '+qual(c.schema,c.table)+' alter column '+ident(c.name)+' set default '+c.default);
 stage='auth reference stubs';await db.query('insert into auth.users(id) select value::uuid from jsonb_array_elements_text($1::jsonb)',[JSON.stringify(payload.auth_reference_ids)]);
 for(const t of tables){stage='data '+t.schema+'.'+t.name;const rows=payload.tables[t.schema+'.'+t.name]||[];const cols=m.columns.filter(c=>c.schema===t.schema&&c.table===t.name&&!c.generated).sort((a,b)=>a.number-b.number).map(c=>ident(c.name)).join(',');
  for(let i=0;i<rows.length;i+=200)await db.query('insert into '+qual(t.schema,t.name)+'('+cols+') overriding system value select '+cols+' from jsonb_populate_recordset(null::'+qual(t.schema,t.name)+',$1::jsonb)',[JSON.stringify(rows.slice(i,i+200))]);
 }
 stage='constraints';for(const type of ['p','u','c','x'])for(const c of m.constraints.filter(c=>c.type===type))await db.exec('alter table '+qual(c.schema,c.table)+' add constraint '+ident(c.name)+' '+c.def);
 stage='indexes';for(const index of m.indexes){const exists=(await db.query('select to_regclass($1) x',[index.schemaname+'.'+index.indexname])).rows[0].x;if(!exists)await db.exec(index.indexdef);}
 stage='constraints';for(const c of m.constraints.filter(c=>c.type==='f'))await db.exec('alter table '+qual(c.schema,c.table)+' add constraint '+ident(c.name)+' '+c.def);
 stage='triggers';for(const t of m.triggers){await db.exec(t.def);if(t.enabled==='D')await db.exec('alter table '+qual(t.schema,t.table)+' disable trigger '+ident(t.name));}
 stage='RLS policies';for(const p of m.policies)await db.exec('create policy '+ident(p.policyname)+' on '+qual(p.schemaname,p.tablename)+' as '+p.permissive+' for '+p.cmd+' to '+p.roles.map(r=>r==='public'?'public':ident(r)).join(',')+(p.qual?' using ('+p.qual+')':'')+(p.with_check?' with check ('+p.with_check+')':''));
 stage='ACL';for(const s of m.schemas)await acl(ident(s.name),s.acl,'schema');for(const t of m.relations)await acl(qual(t.schema,t.name),t.acl,'table');for(const f of m.functions)await acl(qual(f.schema,f.name)+'('+f.identity+')',f.acl,'function');
 // Restore per-column grants, including the staff-name-only member update grant.
 for(const c of m.columns.filter(c=>c.acl))for(const item of c.acl.slice(1,-1).split(',')){const match=item.replaceAll('"','').match(/^([^=]*)=([^/]+)\//);if(!match)continue;for(const right of match[2].replaceAll('*','')){const name={r:'select',w:'update',a:'insert',x:'references'}[right];if(name)await db.exec('grant '+name+'('+ident(c.name)+') on table '+qual(c.schema,c.table)+' to '+(match[1]?ident(match[1]):'public'));}}
 for(const t of tables){await db.exec('alter table '+qual(t.schema,t.name)+(t.rls?' enable':' disable')+' row level security');if(t.force_rls)await db.exec('alter table '+qual(t.schema,t.name)+' force row level security');}
 stage='sequences';for(const s of m.sequences||[]){const seq=s.schemaname+'.'+s.sequencename;await db.query('select setval($1::regclass,$2::bigint,$3)',[seq,s.last_value||s.start_value,!!s.last_value]);}
 const sourceTables=tables.filter(t=>Object.hasOwn(payload.tables,t.schema+'.'+t.name));
 const restored={};for(const t of sourceTables){stage='verify '+t.schema+'.'+t.name;const rows=(await db.query('select coalesce(jsonb_agg(to_jsonb(t)),\'[]\'::jsonb) x from '+qual(t.schema,t.name)+' t')).rows[0].x;const key=t.schema+'.'+t.name;restored[key]={rows:rows.length,hash:hashRows(rows)};if(JSON.stringify(restored[key])!==JSON.stringify(before[key]))throw Error('Restored rows mismatch');}
 stage='migration rehearsal';await db.exec(fs.readFileSync(path.join(repo,'supabase/migrations/20261120051058_safe_granular_facility_permissions.sql'),'utf8'));
 for(const t of sourceTables){stage='migration preservation '+t.schema+'.'+t.name;const rows=(await db.query('select coalesce(jsonb_agg(to_jsonb(t)),\'[]\'::jsonb) x from '+qual(t.schema,t.name)+' t')).rows[0].x;const key=t.schema+'.'+t.name;if(rows.length!==before[key].rows||hashRows(rows)!==before[key].hash)throw Error('Migration modified an existing row');}
 stage='permission mapping verification';const legacy=(await db.query("select count(*)::int n from public.organization_facility_editors e join public.organization_members m using(organization_id,user_id) where e.enabled and m.role='staff' ")).rows[0].n;
 const grants=(await db.query("select count(*)::int n from public.organization_feature_permissions where scope='legacy' and feature in('resident_info','handoff_settings','meal_settings','assignment_settings')")).rows[0].n;
 const extras=(await db.query("select count(*)::int n from public.organization_feature_permissions where scope<>'legacy' or feature not in('resident_info','handoff_settings','meal_settings','assignment_settings')")).rows[0].n;
 if(grants!==legacy*4||extras!==0)throw Error('Legacy permission mismatch');
 stage='live authorization probe rehearsal';await db.exec(fs.readFileSync(path.join(repo,'supabase/checks/20261120051058_verify_facility_permissions.sql'),'utf8'));
 const report={passed:true,encryptedBackupSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'app-backup.gpg'))).digest('hex'),capturedAt:payload.captured_at,restoredAt:new Date().toISOString(),tables:sourceTables.length,schemaTables:tables.length,backupScope:payload.scope||'Legacy full application backup',views:m.relations.filter(t=>t.kind==='v').length,functions:m.functions.length,policies:m.policies.length,authReferenceStubCount:payload.auth_reference_ids.length,totalRows:Object.values(before).reduce((n,t)=>n+t.rows,0),restoredTables:restored,legacyEditors:legacy,legacyGrants:grants,newOrExpandedGrants:extras,allExistingRowsUnchangedAfterRehearsal:true,migrationRehearsalPassed:true,scope:'Application schemas and data; auth UUID reference stubs only. No passwords, auth sessions, tokens, Storage objects, or full managed Auth service restoration. Restore uses in-memory local PGlite; no production access.'};
 fs.writeFileSync(path.join(root,'restore-report.json'),JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify({passed:report.passed,tables:report.tables,totalRows:report.totalRows,functions:report.functions,policies:report.policies,legacyEditors:legacy,legacyGrants:grants,newOrExpandedGrants:extras,allExistingRowsUnchangedAfterRehearsal:true}));
})().catch(e=>{console.error(JSON.stringify({passed:false,stage,code:e.code||e.name,metadataError:/^(bootstrap|table |functions|views|defaults|constraints|indexes|triggers|RLS policies|ACL|sequences|migration rehearsal|live authorization probe rehearsal)/.test(stage)?e.message:undefined}));process.exitCode=1;}).finally(async()=>{if(db)await db.close();});
