// Real November 12 / current-main / revised screens with identical fictional facts.
// All Auth/API calls are intercepted by the parent into isolated Postgres.
module.exports=async function({pageFor,STAFF,width,out}){
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
 const {cases}=require('./fixtures/record_evidence_cases.cjs'),versions=['last-week','main-before-nov12','revised'],results=[],measurements=[];
 const generate=async p=>{await p.getByRole('button',{name:'AIで記録作成',exact:true}).click();await p.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('未保存'));return p.evaluate(()=>({visit:document.getElementById('visitResult').textContent,care:document.getElementById('careResult').textContent}));};
 const metrics=async p=>p.locator('#input').evaluate(input=>{const e=input.closest('.card');const visible=[...e.querySelectorAll('input,select,textarea,button,summary')].filter(x=>x.checkVisibility());return {height:Math.round(e.getBoundingClientRect().height),visibleControls:visible.length,visibleCheckboxes:visible.filter(x=>x.type==='checkbox').length,serviceChoices:e.querySelectorAll('input[name=serviceContent]').length,serviceValues:[...e.querySelectorAll('input[name=serviceContent]')].map(x=>x.value),fontSize:getComputedStyle(input).fontSize};});
 const base=async(p,service)=>{await p.locator('#user').selectOption('resident-101');await p.waitForLoadState('networkidle');await p.locator('input[name=serviceContent][value="'+service+'"]').check();await p.locator('#interventionLevel').selectOption('active');await p.locator('#visitScene').selectOption('ベッド上で側臥位で休んでいた');await p.locator('#condition').selectOption('笑顔が見られた');await p.locator('#health').selectOption('体調良好');};
 const presetByService={'起床介助':'起床介助-0','服薬介助・確認':'服薬介助・確認-0','トイレ介助':'トイレ介助-1','入浴介助':'入浴介助-0','食事介助':'食事介助-0'};
 const descriptions={
  '起床介助':'起き上がりを介助しました。本人は起床の声かけに返事をされました。支援後は椅子に座って過ごされました。',
  '服薬介助・確認':'服薬の声かけを行い、本人が薬を服用されたことを確認しました。本人は声かけにうなずいて応じられました。服薬後に特に変化は見られませんでした。',
  'トイレ介助':'排泄時の衣類の上げ下げを介助しました。本人から排泄の希望が伝えられました。支援後は椅子に座って過ごされました。',
  '入浴介助':'洗身を介助しました。本人から入浴の希望がありました。支援後は椅子に座って過ごされました。',
  '食事介助':'食事中の見守りを行いました。本人が自分で食具を操作されました。支援後は椅子に座って過ごされました。'
 };
 const responses={'起床介助':'起床の声かけに返事をした','服薬介助・確認':'声かけにうなずいて応じた','トイレ介助':'排泄の希望を伝えた','入浴介助':'入浴を希望した','食事介助':'自分で食具を操作した'};
 for(const version of versions){
  const p=await pageFor(STAFF,version==='revised'?false:version,false);await base(p,'起床介助');
  const input=p.locator('#input').locator('xpath=ancestor::*[contains(@class,"card")][1]');
  const before=await metrics(p);assert.equal(before.serviceChoices,15);assert.equal(before.visibleCheckboxes,15,'no methods or reactions in routine screen');
  await input.screenshot({path:path.join(out,width+'-nov12-'+version+'-routine.png')});
  // Native selects cost two taps (open + select); checkbox and generate cost one.
  measurements.push({version,services:1,tapsToPreview:12,tapsThroughFormalSave:13,...before});
  for(const service of ['食事介助','移動介助'])await p.locator('input[name=serviceContent][value="'+service+'"]').check();
  measurements.push({version,services:3,tapsToPreview:14,tapsThroughFormalSave:15,...await metrics(p)});
  for(const service of ['食事介助','移動介助'])await p.locator('input[name=serviceContent][value="'+service+'"]').uncheck();
  if(version!=='last-week'){
   await p.locator('#factSupportDetails').evaluate(e=>e.open=true);const optional=await metrics(p);
   measurements.push({version,optionalPanel:true,...optional});await input.screenshot({path:path.join(out,width+'-nov12-'+version+'-optional.png')});await p.locator('#factSupportDetails').evaluate(e=>e.open=false);
  }
  for(const rich of [false,true]){
   if(rich){
    if(version==='last-week')await p.locator('#input').fill(descriptions['起床介助']);
    else{await p.locator('#factSupportDetails > summary').click();await p.locator('[data-preset="起床介助-0"]').click();await p.locator('[data-service-details] > summary').click();await p.locator('[data-reaction][value="起床の声かけに返事をした"]').check();await p.locator('[data-after]').selectOption('椅子に座って過ごした');await p.locator('#factSupportDetails').evaluate(e=>e.open=false);}
   }
   for(const mode of ['normal','long']){
    if(version!=='last-week')await p.locator('#length').evaluate(e=>e.closest('details').open=true);
    await p.locator('#length').selectOption(mode);
    if(version!=='last-week')await p.locator('#length').evaluate(e=>e.closest('details').open=false);
    const runs=[];
    for(let n=0;n<(width===390?30:1);n++){
     const row=await generate(p);assert(row.care.startsWith('指示内容確認しました。前回のサービス記録確認しました。'));
     if(version==='revised'){
      assert(!/転倒|安全確認|副作用|血圧|入眠|足元|覚醒状態/.test(row.visit+row.care));
      assert(row.visit.includes('側臥位'));assert(row.visit.includes('笑顔'));assert(row.visit.includes('良好'));
      if(!rich)assert(!/起き上が|返事|うなず|支援後/.test(row.care));
      else{assert(/起き上が(?:り|る動作)/.test(row.care));assert(row.care.includes('返事'));assert(row.care.includes('椅子に座って過ご'));}
      assert(!await p.locator('#factQuickDetail [data-quick-detail]').first().isVisible(),'no expanded post-generation choices');
     }
     runs.push({number:n+1,...row});
    }
    const stat=key=>{const v=runs.map(r=>key==='pair'?r.visit+'\n'+r.care:r[key]);return {unique:new Set(v).size,repeatOccurrences:v.length-new Set(v).size};};
    results.push({version,service:'起床介助',rich,mode,count:runs.length,statistics:{visit:stat('visit'),care:stat('care'),pair:stat('pair')},runs});
   }
  }
  await p.close();
  // Full actual generated text for other services, normal and long, same facts.
  for(const x of cases.slice(1)){
   const p=await pageFor(STAFF,version==='revised'?false:version,false);await base(p,x.service);
   if(version==='last-week')await p.locator('#input').fill(descriptions[x.service]);
   else{await p.locator('#factSupportDetails > summary').click();await p.locator('[data-preset="'+presetByService[x.service]+'"]').click();await p.locator('[data-service-details] > summary').click();await p.locator('[data-reaction][value="'+responses[x.service]+'"]').check();await p.locator('[data-after]').selectOption(x.service==='服薬介助・確認'?'服薬後に特に変化がなかった':'椅子に座って過ごした');}
   const modes={};for(const mode of ['normal','long']){if(version!=='last-week')await p.locator('#length').evaluate(e=>e.closest('details').open=true);await p.locator('#length').selectOption(mode);modes[mode]=await generate(p);}
   results.push({version,service:x.service,rich:true,actualFacts:descriptions[x.service],modes});await p.close();
  }
 }
 const old=measurements.find(m=>m.version==='last-week'&&m.services===1),revised=measurements.find(m=>m.version==='revised'&&m.services===1);
 assert.deepEqual(revised.serviceValues,old.serviceValues);assert(revised.tapsToPreview<=old.tapsToPreview);assert.equal(revised.fontSize,'16px');
 fs.writeFileSync(path.join(out,width+'-nov12-comparison.json'),JSON.stringify({passed:true,width,fictionalOnly:true,productionTouched:false,measurements,results,notes:['Each native select is two taps; checkbox/generate/save one. Scroll/typing time is excluded.','Old version takes explicit care details in the existing optional text field; main/revised take equivalent structured facts.','Old variant RPC is intercepted with a per-signature incrementing synthetic counter.']},null,2));
 console.log('PASS November 12 comparison',width,'actual old/main/revised screens, routine controls, service/intervention choices, same facts, full prose and repeated generation');
};
