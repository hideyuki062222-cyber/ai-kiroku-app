// Same generated-preview -> scoped history -> candidate -> warning -> formal-save
// path as the real screen. The parent intercepts all Supabase traffic into PGlite.
module.exports=async function({pg,atomic,pageFor,STAFF,ORG,ADMIN,id,width,out,baselineRoot}){
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
 const summaries=[];let sequence=0;
 const stats=values=>{const counts=new Map();for(const v of values)counts.set(v,(counts.get(v)||0)+1);return {unique:counts.size,repeatOccurrences:values.length-counts.size,matchingPairs:[...counts.values()].reduce((sum,n)=>sum+n*(n-1)/2,0)};};
 const situations=width===390?['basic-normal','details-normal','details-long','few-facts']:['basic-normal'];
 const all=baselineRoot&&width===390?[{kind:'before',situation:'basic-normal'},{kind:'before',situation:'details-normal'},...situations.map(situation=>({kind:'after',situation}))]:situations.map(situation=>({kind:'after',situation}));
 for(const {kind,situation} of all){
  const before=kind==='before',client=id(700000+(++sequence)),code='repeat-'+sequence,mode=situation==='details-long'?'long':'normal',detailed=situation.startsWith('details');
  await atomic(async()=>{await pg.exec('reset role');await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[ADMIN]);await pg.query('insert into public.clients(id,organization_id,code,display_name,is_active) values($1,$2,$3,$4,true)',[client,ORG,code,'架空の同一利用者']);});
  const read=()=>atomic(async()=>{await pg.exec('reset role');return (await pg.query('select id,organization_id,client_id,visit_note,care_note,daily_facts,created_by,intervention_level from public.care_records where client_id=$1 order by created_at,id',[client])).rows;});
  const configure=async p=>{
   await p.locator('#user').selectOption(code);await p.waitForLoadState('networkidle');
   if(situation!=='few-facts'){await p.locator('#visitScene').selectOption('ベッド上で側臥位で休んでいた');await p.locator('#condition').selectOption('笑顔が見られた');}
   await p.locator('#health').selectOption('体調良好');await p.locator('#interventionLevel').selectOption('active');await p.locator('input[name=serviceContent][value="起床介助"]').check();
   await p.locator('#length').evaluate(e=>e.closest('details').open=true);await p.locator('#length').selectOption(mode);
   if(detailed){await p.locator('#factSupportDetails').evaluate(e=>e.open=true);await p.locator('[data-preset="起床介助-0"]').click();await p.locator('[data-reaction][value="起床の声かけに返事をした"]').check();await p.locator('[data-service-details]').evaluate(e=>e.open=true);await p.locator('.fact-methods').evaluate(e=>e.open=true);await p.locator('[data-method][value="ゆっくり話した"]').check();await p.locator('[data-after]').selectOption('椅子に座って過ごした');}
   await p.evaluate(()=>{const S=NexiaRecordSimilarity,old=S.chooseExpression;S.chooseExpression=function(core,f,scope,rows,seed,previous){const result=old(core,f,scope,rows,seed,previous);window.__repeatSelection={seed,history:rows.map(r=>({visit:r.visit_note,care:r.care_note})),selection:result.selection||null};return result;};});
  };
  let page=await pageFor(STAFF,before,false);await configure(page);const fixed=await page.evaluate(()=>NexiaFactUI.collect()),runs=[];let prefilled=0,adversarialProof=null;
  for(let n=1;n<=30;n++){
   if(n===11||n===21){await page.reload();await page.waitForFunction(()=>window.NexiaFactUI&&window.__nexiaStaffNameReady===true&&window.generate.__formalSaveWrapped);await configure(page);}
   assert.deepEqual(await page.evaluate(()=>NexiaFactUI.collect()),fixed,'unchanged facts even after reload');
   await page.getByRole('button',{name:'AIで記録作成',exact:true}).click();await page.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('未保存'));
   const result=await page.evaluate(()=>{const S=NexiaRecordSimilarity,p=window.__repeatSelection;const visit=document.getElementById('visitResult').textContent,care=document.getElementById('careResult').textContent;const exact=p.history.some(r=>S.normalize(r.visit)===S.normalize(visit)&&S.normalize(r.care)===S.normalize(care));return {visit,care,exact,historyCount:p.history.length,selection:p.selection,notice:document.getElementById('recordSimilarityNotice').textContent,button:document.getElementById('recordCommitButton').textContent};});
   assert(result.care.startsWith('指示内容確認しました。前回のサービス記録確認しました。'));assert(!/薬|副作用|血圧|転倒|足元|覚醒状態/.test(result.visit+result.care));
   if(!detailed)assert(!/起き上が|返事|うなず|ゆっくり話|支援後/.test(result.care));
   else {assert(/起き上が(?:り|る動作)/.test(result.care));assert(result.care.includes('返事'));assert(/ゆっくり(?:と)?話/.test(result.care));assert(result.care.includes('椅子に座って過ご'));}
   if(result.exact){assert(result.notice.includes('文章が一致'));assert.equal(result.button,'当日の事実として正式保存');}
   if(result.selection?.unseenPairCount)assert(!result.exact,'no saved full duplicate if an unused candidate exists');
   const countBefore=(await read()).length;
   await page.locator('#recordCommitButton').click();await page.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('正式にクラウド保存'));
   const persisted=await read();assert.equal(persisted.length,countBefore+1);const saved=persisted.find(r=>r.visit_note===result.visit&&r.care_note===result.care&&r.daily_facts?.expressionRevision===(before?2:3));assert(saved,'the actual selected text and revision were saved through SDK/RLS');assert.equal(saved.created_by,STAFF);assert.equal(saved.intervention_level,'active');assert.deepEqual(saved.daily_facts.actions,fixed.actions);
   runs.push({number:n,...result});
   if(n===1&&situation==='details-normal'){
    // Reproduce the ranking defect using the real preceding draft. The existing
    // synthetic history contains every original candidate except one which
    // shares a section with that draft. No input or saved record is rewritten.
    const setup=await page.evaluate(()=>{
     const C=NexiaFactCore,S=NexiaRecordSimilarity,f=NexiaFactUI.collect(),prev=window.__nexiaPreviousExpression.row,rows=[],seen=new Set();
     for(let i=0;i<32;i++){const seed=i? (3+i*131071)%1048576:3,r=C.compose(f,undefined,seed),key=JSON.stringify([S.normalize(r.visit),S.normalize(r.care)]);if(!seen.has(key)){seen.add(key);rows.push(r);}}
     const unused=rows.find(r=>(S.normalize(r.visit)===S.normalize(prev.visit_note)||S.normalize(r.care)===S.normalize(prev.care_note))&&!(S.normalize(r.visit)===S.normalize(prev.visit_note)&&S.normalize(r.care)===S.normalize(prev.care_note)));
     if(!unused)throw Error('counterexample must share a section with the actual draft');return {rows:rows.filter(r=>r!==unused),unused,previous:prev};
    });
    await atomic(async()=>{await pg.exec('reset role');await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[ADMIN]);for(let i=0;i<setup.rows.length;i++)await pg.query("insert into public.care_records(id,organization_id,client_id,created_by,service_date,visit_note,care_note,created_at) values($1,$2,$3,$4,$5,$6,$7,'2026-11-01T00:00:00Z')",[id(800000+sequence*100+i),ORG,client,ADMIN,'2026-11-01',setup.rows[i].visit,setup.rows[i].care]);});prefilled=setup.rows.length;adversarialProof=setup;
   }
  }
  assert.equal((await read()).length,30+prefilled);
  if(adversarialProof){assert.equal(runs[1].exact,before,'the old ranking repeats despite an unused candidate; the new ranking avoids it');}
  if(situation==='few-facts'){assert(runs.some(r=>r.exact),'finite controlled expressions eventually repeat');assert(runs.some(r=>r.selection?.unseenPairCount===0));}
  await page.locator('#careResult').screenshot({path:path.join(out,width+'-saved-repeat-'+kind+'-'+situation+'.png')});await page.close();
  summaries.push({kind,situation,mode,facts:fixed,formalSaves:30,prefilled,adversarialProof,runs,statistics:{visit:stats(runs.map(r=>r.visit)),care:stats(runs.map(r=>r.care)),pair:stats(runs.map(r=>JSON.stringify([r.visit,r.care]))),normalizedPair:stats(runs.map(r=>JSON.stringify([r.visit.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,''),r.care.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'')]))),exactToSavedHistory:runs.filter(r=>r.exact).length}});
 }
 fs.writeFileSync(path.join(out,width+'-saved-repeat.json'),JSON.stringify({passed:true,width,actualPinnedHTML:true,isolatedPostgres:true,productionTouched:false,summaries},null,2));
 console.log('PASS saved-repeat browser',width,JSON.stringify(summaries.map(s=>({kind:s.kind,situation:s.situation,formalSaves:s.formalSaves,statistics:s.statistics}))));
};
