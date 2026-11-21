const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../record-facts-core'),{minimal,cases,detailed}=require('./fixtures/record_evidence_cases.cjs');
let count=0;const comparisons=[];
for(const x of cases){
 const input=detailed(x),original=JSON.stringify(input),modes={};
 for(const lengthMode of ['short','normal','long']){
  const f={...input,lengthMode};modes[lengthMode]=C.compose(f);
  for(let seed=0;seed<256;seed++){
   const out=C.compose(f,{support:'未確認の洗髪と安全確認'},seed),full=out.visit+out.care;
   assert.deepEqual(out.errors,[]);assert(out.care.startsWith(C.INTRO));assert.equal(out.care.split(C.INTRO).length,2);
   assert(/側臥位/.test(out.visit));assert(/笑顔/.test(out.visit));assert(/良好/.test(out.visit));assert(out.visit.includes('このあと椅子で過ごしたい'));assert(out.visit.includes('動作がゆっくり'));
   for(const anchor of x.anchors)assert(anchor.test(out.care),x.service+' '+lengthMode+' '+anchor+' '+out.care);
   for(const bad of x.forbidden)assert(!full.includes(bad),x.service+': invented '+bad);
   assert(/ゆっくり(?:と)?話/.test(out.care));assert(!/[【】]|ましました|ました、|まし、/.test(full));
   assert(!/本人は支援後.*本人は支援後/.test(out.care));assert.equal(JSON.stringify(input),original);assert.deepEqual(out,C.compose(f,{},seed));count++;
  }
 }
 // Volume means text, excluding whitespace and the mandatory introduction.
 const size=mode=>modes[mode].care.replace(C.INTRO,'').replace(/\s/g,'').length;
 assert(size('short')<size('normal'),x.service+' short/normal actual prose differs');
 assert(size('normal')<size('long'),x.service+' normal/long explicit roles and methods');
 comparisons.push({service:x.service,facts:input,modes,characters:Object.fromEntries(Object.entries(modes).map(([k,v])=>[k,{visit:v.visit.replace(/\s/g,'').length,care:v.care.replace(/\s/g,'').length}]))});
}
for(const lengthMode of ['short','normal','long'])for(let seed=0;seed<32;seed++){
 const out=C.compose({...minimal,lengthMode},undefined,seed);assert.deepEqual(out.errors,[]);assert.deepEqual(out.needsDetail,['起床介助']);assert(!/起き上が|手順|うなず|返事|歩行|入眠|足元|覚醒状態/.test(out.care));
 const chosen=C.quickChoices['起床介助'][0],filled=C.compose({...minimal,lengthMode,actions:[{...minimal.actions[0],actions:chosen.actions}]},undefined,seed);
 assert.deepEqual(filled.needsDetail,[]);assert(/起き上が(?:り|る動作)/.test(filled.care));assert(!/返事|うなず|支援後|ゆっくり話/.test(filled.care));count++;
}
for(const lengthMode of ['short','normal','long']){const quoted=C.compose({...minimal,lengthMode,statement:'体調良好',concern:'笑顔が見られた'});assert(quoted.visit.includes('「体調良好」'));assert(quoted.visit.includes('笑顔が見られた。'));}
const duplicate=C.compose({...minimal,response:'うなずいて応じた',after:'椅子に座って過ごした',actions:[{...minimal.actions[0],service:'食事介助',actions:['食事中の見守りを行った'],reactions:['声かけにうなずいて応じた'],after:'椅子に座って過ごした'}]});assert.equal(duplicate.care.split('うなずいて').length,2);assert.equal(duplicate.care.split('椅子に座って過ご').length,2);
for(const lengthMode of ['short','normal','long']){const observed=C.compose({...minimal,lengthMode,actions:[{...minimal.actions[0],reactions:['眠気を訴えた'],after:'ベッドで休んだ'}]});assert(observed.care.includes('眠気の訴え'));assert(observed.care.includes('ベッドで休まれました'));assert.deepEqual(observed.needsDetail,['起床介助']);const uncertain=C.compose({...minimal,lengthMode,actions:[{service:'服薬介助・確認',confirmedService:true,actions:[],unconfirmed:true}]});assert(uncertain.care.includes('服用済みかは確認していません'));}
// The source path remains the actual input position even after unperformed rows.
const plan=C.evidencePlan({...minimal,actions:[{service:'入浴介助',actions:[]},minimal.actions[0]]});assert.equal(plan.services[0].source,'actions.1');assert.deepEqual(plan.services[0].actions,[]);
for(const level of Object.keys(C.interventionLabels)){
 const out=C.compose({...minimal,interventionLevel:level});assert.deepEqual(out.needsDetail,['起床介助']);assert(!/起き上が|返事|入眠/.test(out.care));
}
for(const lengthMode of ['short','normal','long'])for(const reactions of [['服薬を拒否した'],[]]){
 const out=C.compose({...minimal,lengthMode,actions:[{service:'服薬介助・確認',actions:['服薬の声かけを行った'],unconfirmed:true,reactions}]});assert(out.care.includes('服用済みかは確認していません'));assert(!/服用されたこと|服薬されました/.test(out.care));
}
if(process.env.RECORD_EVIDENCE_OUTPUT){fs.mkdirSync(process.env.RECORD_EVIDENCE_OUTPUT,{recursive:true});fs.writeFileSync(process.env.RECORD_EVIDENCE_OUTPUT+'/comparisons.json',JSON.stringify({count,minimal:Object.fromEntries(['short','normal','long'].map(lengthMode=>[lengthMode,C.compose({...minimal,lengthMode})])),comparisons},null,2));}
console.log('PASS evidence quality:',count,'generations: exact reported inputs, 5 services x 3 lengths x 256 seeds, no fabricated actions, chosen method only, independent roles, unconfirmed/refusal');
