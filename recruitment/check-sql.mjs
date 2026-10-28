// Static preflight only. Does not connect to Supabase or execute SQL.
// Run: node recruitment/check-sql.mjs
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../database/recruitment_head_office_draft.sql',import.meta.url),'utf8');
const tables=['recruitment_admins','recruitment_departments','recruitment_jobs','recruitment_applicants','recruitment_school_contacts'];
const checks=[
 ...tables.map(t=>[t+' RLS enabled',sql.includes('alter table public.'+t+' enable row level security;')]),
 ...tables.slice(1).map(t=>[t+' admin-only policy',new RegExp('create policy recruitment_\\w+ on public\\.'+t+'[\\s\\S]*?for all to authenticated[\\s\\S]*?recruitment_admins').test(sql)]),
 ['No anonymous INSERT grant',!/\\bgrant\\s+insert\\b[\\s\\S]*?\\bto\\s+anon\\b/i.test(sql)],
 ['No embedded service role key',!/service_role\\s*[:=]\\s*['"][A-Za-z0-9]/i.test(sql)],
 ['No admin self-grant',!/\\bgrant\\s+(insert|update|delete)\\s+on\\s+public\\.recruitment_admins\\b/i.test(sql)]
];
for(const [name,ok] of checks)console.log((ok?'PASS ':'FAIL ')+name);
console.log(checks.filter(x=>x[1]).length+'/'+checks.length+' static checks passed');
if(checks.some(x=>!x[1]))process.exitCode=1;
// This cannot prove SQL parses or that RLS works. Test on a separate DB before production.
