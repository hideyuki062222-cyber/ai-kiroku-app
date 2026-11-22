// Real UI + existing SDK + isolated Postgres. No production calls or actual users.
module.exports=async function({pageFor,STAFF,width,out,pg,atomic,CLIENT,baselineRoot}){
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{cases,minimal,detailed}=require('./fixtures/record_evidence_cases.cjs');
 const results=[];
 const configure=async(page,x,rich=false)=>{
  await page.locator('#user').selectOption('resident-101');await page.waitForLoadState('networkidle');
  await page.locator('#visitScene').selectOption(minimal.scene);await page.locator('#condition').selectOption(minimal.condition);await page.locator('#health').selectOption(minimal.health);
  await page.locator('#interventionLevel').selectOption(rich?detailed(x).interventionLevel:'active');await page.locator('input[name=serviceContent][value="'+x.service+'"]').check();
  await page.locator('#length').evaluate(e=>e.closest('details').open=true);
 };
 const generate=async(page,lengthMode)=>{await page.locator('#length').selectOption(lengthMode);await page.getByRole('button',{name:'AIで記録作成',exact:true}).click();await page.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('未保存'));return page.evaluate(()=>({visit:document.getElementById('visitResult').textContent,care:document.getElementById('careResult').textContent,facts:NexiaFactUI.collect()}));};
 const picture=async(page,name)=>{assert((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1,'no horizontal overflow');await page.locator('#factInputCard').screenshot({path:path.join(out,width+'-evidence-'+name+'.png')});if(await page.locator('#factQuickDetail').count()&&await page.locator('#factQuickDetail').isVisible())await page.locator('#factQuickDetail').screenshot({path:path.join(out,width+'-evidence-'+name+'-guide.png')});await page.locator('#careResult').screenshot({path:path.join(out,width+'-evidence-'+name+'-record.png')});};
 const preserved=await atomic(async()=>{await pg.exec('reset role');return (await pg.query('select id,to_jsonb(r) data from public.care_records r order by id')).rows;});
 const recordCount=await atomic(async()=>{await pg.exec('reset role');return (await pg.query('select count(*)::int n from public.care_records')).rows[0].n;});
 if(baselineRoot){const before=await pageFor(STAFF,true,false);await configure(before,cases[0]);const modes={};for(const mode of ['short','normal','long'])modes[mode]=await generate(before,mode);await picture(before,'before-basic');results.push({baseline:true,service:cases[0].service,modes});await before.close();}
 for(const x of cases){
  const page=await pageFor(STAFF,false,false);await configure(page,x);
  assert.equal(await page.locator('input[name=serviceContent]').count(),15);assert.equal(await page.locator('[data-service-picker]').count(),0);
  const basic={};for(const mode of ['short','normal','long']){basic[mode]=await generate(page,mode);assert(await page.locator('#factQuickDetail').isVisible());assert.equal(basic[mode].facts.actions[0].actions.length,0);assert(!/起き上が|うなず|返事|薬を服用された|背部の洗身|衣類の上げ下げ/.test(basic[mode].care));}
  if(x.service==='起床介助')await picture(page,'after-basic');
  const original=await page.evaluate(()=>NexiaFactUI.collect());
  await page.locator('#factQuickDetail > summary').click();
  // One choice sets exactly the labelled preset and regenerates. A double tap is idempotent.
  await page.locator('[data-quick-detail="'+x.preset+'"]').evaluate(b=>{b.click();b.click();});
  await page.waitForFunction(()=>document.getElementById('factQuickDetail').hidden&&document.getElementById('recordSaveStatus').textContent.includes('未保存')&&!document.getElementById('recordCommitButton').disabled);
  const one=await page.evaluate(()=>({facts:NexiaFactUI.collect(),care:document.getElementById('careResult').textContent}));
  const preset=require('../record-facts-core').quickChoices[x.service].find(p=>p.id===x.preset);
  assert.deepEqual(one.facts.actions[0].actions,preset.actions);assert.deepEqual(one.facts.actions[0].reactions,original.actions[0].reactions);assert.deepEqual(one.facts.actions[0].methods,original.actions[0].methods);assert.equal(one.facts.actions[0].after,'');assert(!/うなず|返事|支援後/.test(one.care));
  if(x.service==='起床介助'){
   assert(/起き上がる動作/.test(one.care));await picture(page,'one-click');
   await page.locator('#recordCommitButton').click();await page.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('正式にクラウド保存'));
   const saved=await atomic(async()=>{await pg.exec('reset role');return (await pg.query('select * from public.care_records where client_id=$1 order by created_at desc',[CLIENT])).rows[0];});
   assert.deepEqual(saved.daily_facts.actions[0].actions,preset.actions);assert.equal(saved.daily_facts.composerRevision,4);assert.equal(saved.intervention_level,'active');assert(saved.care_note.includes('起き上がる動作'));
  }
  await page.locator('#factSupportDetails').evaluate(e=>e.open=true);await page.locator('[data-service-details]').evaluate(e=>e.open=true);await page.locator('.fact-methods').evaluate(e=>e.open=true);await page.locator('#factObservationDetails').evaluate(e=>e.open=true);
  await page.locator('#interventionLevel').selectOption(detailed(x).interventionLevel);
  await page.locator('#factStatement').fill('このあと椅子で過ごしたい');await page.locator('#factDifference').selectOption('普段より動作がゆっくりだった');
  await page.locator('[data-action]').evaluateAll((inputs,actions)=>inputs.forEach(i=>{i.checked=actions.includes(i.value);i.dispatchEvent(new Event('change',{bubbles:true}));}),x.actions);await page.locator('[data-reaction][value="'+x.reactions[0]+'"]').check();if(x.self)await page.locator('[data-self]').selectOption(x.self);await page.locator('[data-method][value="ゆっくり話した"]').check();await page.locator('[data-after]').selectOption(x.after);
  const modes={};for(const mode of ['short','normal','long']){modes[mode]=await generate(page,mode);for(const anchor of x.anchors)assert(anchor.test(modes[mode].care));for(const bad of x.forbidden)assert(!(modes[mode].visit+modes[mode].care).includes(bad));}
  const size=mode=>modes[mode].care.replace(/\s/g,'').length;assert(size('short')<size('normal'));assert(size('normal')<size('long'));
  if(x.service==='起床介助')await picture(page,'detailed');
  // Preview-only generation never creates rows. Only the explicit save above does.
  results.push({service:x.service,basic,oneClick:one,modes});await page.close();
 }
 const end=await atomic(async()=>{await pg.exec('reset role');return (await pg.query('select count(*)::int n from public.care_records')).rows[0].n;});assert.equal(end,recordCount+1);await atomic(async()=>{await pg.exec('reset role');for(const row of preserved)assert.deepEqual((await pg.query('select to_jsonb(r) data from public.care_records r where id=$1',[row.id])).rows[0].data,row.data);});
 // Hand-edited output and changed input must not be overwritten by a stale shortcut.
 const edited=await pageFor(STAFF,false,false);await configure(edited,cases[0]);await generate(edited,'normal');await edited.locator('#careResult').fill('職員が確認して編集した文章。');await edited.locator('#factQuickDetail').evaluate(e=>e.open=true);await edited.locator('[data-quick-detail="起床介助-0"]').click();assert.equal(await edited.locator('#careResult').innerText(),'職員が確認して編集した文章。');assert.equal((await edited.evaluate(()=>NexiaFactUI.collect())).actions[0].actions.length,0);
 await generate(edited,'normal');await edited.locator('#condition').selectOption('眠そうな様子が見られた');await edited.locator('#factQuickDetail').evaluate(e=>e.open=true);await edited.locator('[data-quick-detail="起床介助-0"]').click();assert(await edited.locator('#factQuickDetail').isHidden());assert.equal((await edited.evaluate(()=>NexiaFactUI.collect())).actions[0].actions.length,0);await edited.close();
 fs.writeFileSync(path.join(out,width+'-evidence.json'),JSON.stringify({passed:true,width,oneClick:true,manualEditProtected:true,staleChoiceRejected:true,realProductionData:false,results},null,2));
 console.log('PASS evidence browser',width,'reported bed-side-position case, 5 services x 3 lengths, one-click method + auto-regenerate, double tap, factual save, preserved edits and stale-input rejection');
};
