// Actual NEXIA HTML -> collect -> compose/rephrase -> similarity -> SDK save ->
// RLS-enabled isolated Postgres -> persisted-history rendering. Fictional data only.
module.exports=async function({pageFor,STAFF,ADMIN,ORG,CLIENT,pg,atomic,id,width,out,date}){
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{cases}=require('./fixtures/record_memo_cases.cjs');
 const read=sql=>atomic(async()=>{await pg.exec('reset role');return (await pg.query(sql)).rows;});
 const preserved=await read('select id,to_jsonb(r) data from public.care_records r order by id');
 const clients=await read('select id,to_jsonb(c) data from public.clients c order by id');
 const results=[];
 const configure=async(p,x)=>{
  await p.locator('#user').selectOption('resident-101');await p.waitForLoadState('networkidle');
  await p.locator('input[name=serviceContent][value="'+x.service+'"]').check();await p.locator('#interventionLevel').selectOption(x.level);
  await p.locator('#visitScene').selectOption('ベッド上で側臥位で休んでいた');await p.locator('#condition').selectOption('笑顔が見られた');await p.locator('#health').selectOption('体調良好');
  await p.locator('#input').fill(x.memo);await p.locator('#length').evaluate(e=>e.closest('details').open=true);
 };
 const generate=async(p,mode)=>{await p.locator('#length').selectOption(mode);await p.getByRole('button',{name:'AIで記録作成',exact:true}).click();await p.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('未保存'));return p.evaluate(()=>({visit:document.getElementById('visitResult').textContent,care:document.getElementById('careResult').textContent,facts:NexiaFactUI.collect(),status:document.getElementById('factCompositionStatus').textContent}));};
 for(let i=0;i<cases.length;i++){
  const x=cases[i],assignment=id(1100+i);
  await atomic(async()=>{await pg.exec('reset role');await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[ADMIN]);await pg.query("insert into public.staff_assignments(id,organization_id,client_id,service_date,service_time,assigned_user_id,assigned_staff_name,memo,created_by,updated_by) values($1,$2,$3,$4,$5,$6,'架空職員','架空の自由メモ検証',$7,$7)",[assignment,ORG,CLIENT,date,'10:'+String(i*10).padStart(2,'0'),STAFF,ADMIN]);});
  const beforePage=await pageFor(STAFF,'memo-before',false);await configure(beforePage,x);const before={};for(const mode of ['normal','long'])before[mode]=await generate(beforePage,mode);await beforePage.close();
  const p=await pageFor(STAFF,false,assignment);await configure(p,x);
  assert.equal(await p.locator('input[name=serviceContent]').count(),15);assert(await p.locator('#interventionLevel').isVisible());
  assert.equal(await p.locator('[data-action]:visible,[data-reaction]:visible,[data-method]:visible').count(),0,'no extra choices are required for memo input');
  const after={};
  for(const mode of ['normal','long']){
   after[mode]=await generate(p,mode);const r=after[mode];assert.equal(r.facts.supportNote,x.memo);assert.equal(r.facts.actions[0].actions.length,0,'staff did not need to enter facts twice');
   assert(r.care.startsWith('指示内容確認しました。前回のサービス記録確認しました。'));for(const re of x.anchors)assert(re.test(r.care),x.id+' '+re+' '+r.care);for(const bad of x.forbidden)assert(!(r.care+r.visit).includes(bad),x.id+' invented '+bad);
   const trace=await p.evaluate(()=>{const f=NexiaFactUI.collect();return NexiaFactCore.compose(f).memoEvidence;});assert.equal(trace.length,x.facts.length);assert(trace.every(e=>x.memo.slice(e.start,e.end)===e.source));assert(trace.every(e=>e.kind!=='raw'));
   await p.locator('#careResult').screenshot({path:path.join(out,width+'-memo-'+x.id+'-'+mode+'.png')});
  }
  assert(after.long.care.length>after.normal.care.length,'long explicitly states assistance roles');
  await p.locator('#length').evaluate(e=>e.closest('details').open=false);await p.locator('#factInputCard').screenshot({path:path.join(out,width+'-memo-'+x.id+'-input.png')});
  const edited=after.long.care.replace('支援後は、','支援後は').replace('服薬後、','服薬後は、').replace('支援後、本人から','支援後には本人から');await p.locator('#careResult').fill(edited);
  await p.locator('#recordCommitButton').click();await p.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('正式にクラウド保存'));
  const rows=await atomic(async()=>{await pg.exec('reset role');return (await pg.query('select * from public.care_records where assignment_id=$1',[assignment])).rows;});
  assert.equal(rows.length,1);const saved=rows[0];assert.equal(saved.care_note,edited);assert.equal(saved.visit_note,after.long.visit);assert.equal(saved.daily_facts.supportNote,x.memo);assert.equal(saved.daily_facts.memoComposerRevision,1);assert.equal(saved.created_by,STAFF);assert.equal(saved.organization_id,ORG);assert.equal(saved.client_id,CLIENT);assert.equal(saved.intervention_level,x.level);
  // The persisted row, not the draft, must be visible after a reload.
  await p.reload();await p.waitForFunction(()=>window.__assignmentContextGuardReady===true&&window.__nexiaStaffNameReady===true);await p.locator('#recordHistoryClient').selectOption(CLIENT);await p.locator('#recordHistoryDate').fill(date);await p.locator('#recordHistoryDate').dispatchEvent('change');
  await p.locator('[data-record-id="'+saved.id+'"]').waitFor({state:'attached'});assert((await p.locator('[data-record-id="'+saved.id+'"]').textContent()).includes(edited));
  if(i===0){await p.locator('[data-record-id="'+saved.id+'"]').evaluate(e=>e.closest('details').open=true);await p.locator('[data-record-id="'+saved.id+'"]').screenshot({path:path.join(out,width+'-memo-saved-history.png')});}
  assert((await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1);
  results.push({id:x.id,service:x.service,memo:x.memo,confirmedFacts:x.facts,before,after,saved:{id:saved.id,rawMemo:saved.daily_facts.supportNote,body:saved.care_note,historyAfterReload:true},extraRequiredChoices:0});await p.close();
 }
 // An ambiguous suffix/quote stays verbatim and the review notice does not force extra input.
 const caution=await pageFor(STAFF,false,false);const x={...cases[1],memo:'服薬の声かけ／服用を確認していない／本人は「まだ」と発言'};await configure(caution,x);const unknown=await generate(caution,'normal');assert(!unknown.care.includes('薬を服用されたことを確認しました'));assert(unknown.care.includes('服用を確認していない'));assert(unknown.care.includes('本人は「まだ」と発言'));assert(unknown.status.includes('原文'));await caution.close();
 await atomic(async()=>{await pg.exec('reset role');for(const r of preserved)assert.deepEqual((await pg.query('select to_jsonb(r) data from public.care_records r where id=$1',[r.id])).rows[0].data,r.data);for(const c of clients)assert.deepEqual((await pg.query('select to_jsonb(c) data from public.clients c where id=$1',[c.id])).rows[0].data,c.data);});
 fs.writeFileSync(path.join(out,width+'-memo.json'),JSON.stringify({passed:true,width,pinnedHTML:true,realSDK:true,isolatedPostgres:true,productionTouched:false,existingRowsPreserved:true,results,unknownMemo:unknown},null,2));
 console.log('PASS short-memo real-screen path',width,'5 services x normal/long; no repeated choices; original notes retained; edited formal saves and history reload; source/fact alignment; existing rows retained');
};
