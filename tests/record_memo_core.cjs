const assert=require('node:assert/strict'),C=require('../record-facts-core'),{cases}=require('./fixtures/record_memo_cases.cjs');
const facts=x=>({version:1,date:'2026-11-21',scene:'ベッド上で側臥位で休んでいた',condition:'笑顔が見られた',health:'体調良好',interventionLevel:x.level,actions:[{service:x.service,confirmedService:true,actions:[],reactions:[],methods:[],self:'',after:'',note:''}],supportNote:x.memo});
let count=0;const examples=[];
for(const x of cases){
 const f=facts(x),original=JSON.stringify(f),outputs={};
 for(const lengthMode of ['normal','long']){
  for(let seed=0;seed<128;seed++){
   const r=C.compose({...f,lengthMode},{legacy:{support_method:'未確認の洗髪や安全確認'}},seed);
   assert.deepEqual(r.errors,[]);assert.deepEqual(r.memoReview,[]);assert(!r.memoConflict);assert(r.care.startsWith(C.INTRO));assert.equal(r.care.split(C.INTRO).length,2);
   for(const re of x.anchors)assert(re.test(r.care),x.id+' missing '+re+' '+r.care);
   for(const bad of x.forbidden)assert(!(r.visit+r.care).includes(bad),x.id+' invented '+bad+' '+r.care);
   assert.equal(r.memoEvidence.length,x.facts.length);assert(r.memoEvidence.every(e=>x.memo.slice(e.start,e.end)===e.source));assert(r.memoEvidence.every(e=>e.kind!=='raw'));
   assert(!/[【】]|ました、|ましました/.test(r.care));assert.deepEqual(r,C.compose({...f,lengthMode},{},seed));assert.equal(JSON.stringify(f),original);count++;
  }
  outputs[lengthMode]=C.compose({...f,lengthMode});
 }
 assert(outputs.long.care.length>outputs.normal.care.length,'long clarifies roles, not just line breaks: '+x.id);examples.push({id:x.id,memo:x.memo,facts:x.facts,outputs});
}
const base=facts(cases[1]);
for(const memo of ['声かけ／服用未確認','服薬拒否','本人が服薬を拒否','服薬確認','服用を確認していない','服薬の声かけ予定','本人は「服用を確認」と話した']){
 const r=C.compose({...base,supportNote:memo});assert(!/薬を服用されたことを確認|自分で服薬され/.test(r.care));count++;
}
for(const memo of ['起き上がり介助予定','起き上がり介助なし','起き上がり介助かも','起き上がり介助？','職員が返事をした','血圧125/80','食事1/2摂取','本人は「右膝／左膝が痛い」と話した','薬剤A 2錠','本人は「いいえ」と発言。立ち上がりは見ていない']){
 const r=C.compose({...facts(cases[0]),supportNote:memo});assert(r.memoReview.length);assert(r.care.includes(memo));assert(!r.care.includes('本人が起き上がる動作を職員が介助しました'));count++;
}
for(const memo of ['起き上がり介助／ではなく声かけ','起き上がり介助／一部のみ','服用を確認／していない','服薬の声かけ／以外は予定']){const r=C.compose({...facts(cases[0]),supportNote:memo});assert(r.care.includes(memo));assert(!r.care.includes('起き上がりを介助しました'));}
const spaced='  起き上がり介助  ／ 本人から返事 ';const spacedOut=C.compose({...facts(cases[0]),supportNote:spaced});for(const e of spacedOut.memoEvidence)assert.equal(spaced.slice(e.start,e.end),e.source);
const conflict=C.compose({...base,supportNote:'服用を確認／服用未確認'});assert(conflict.memoConflict);assert(conflict.care.includes('服用を確認／服用未確認'));assert(!conflict.care.includes('薬を服用されたことを確認しました'));
const structured={...base,actions:[{service:'服薬介助・確認',actions:['服薬の声かけを行った'],unconfirmed:true}],supportNote:'服用を確認'};assert(C.compose(structured).memoConflict);
const duplicate=C.compose({...facts(cases[0]),actions:[{service:'起床介助',actions:['起き上がりを介助した']}],supportNote:'起き上がり介助'});assert(duplicate.memoEvidence[0].represented);assert.equal(duplicate.care.split('起き上がり').length,2,'same fact entered twice is rendered once');
const unspecified=C.compose({...base,supportNote:'返事あり／うなずきあり'});assert(!unspecified.care.includes('本人から返事'));assert(!unspecified.care.includes('声かけにうなず'));
for(const service of Object.keys(C.serviceActions)){
 const action=C.serviceActions[service][0],x={...facts(cases[0]),interventionLevel:'',actions:[{service,confirmedService:true,actions:[]}],supportNote:action};const r=C.compose(x);assert.deepEqual(r.errors,[]);assert.equal(r.memoEvidence[0].kind,'work');assert(!r.care.includes('安全確認'));count++;
}
console.log('PASS memo facts:',count,'generations/edge cases; 5 short memos, two lengths, exact source spans, no inferred facts, denied/unknown/quote/quantity preservation, structured-note deduplication');
if(process.env.RECORD_MEMO_OUTPUT){const fs=require('node:fs');fs.mkdirSync(process.env.RECORD_MEMO_OUTPUT,{recursive:true});fs.writeFileSync(process.env.RECORD_MEMO_OUTPUT+'/core.json',JSON.stringify({passed:true,count,examples},null,2));}
