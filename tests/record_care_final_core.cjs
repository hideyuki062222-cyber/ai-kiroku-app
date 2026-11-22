const assert=require('node:assert/strict'),C=require('../record-facts-core'),R=require('../record-routine-core'),K=require('../record-care-catalog'),S=require('../record-similarity');
const fs=require('node:fs'),results=[];let generations=0;
const {plan,facts}=require('./fixtures/record_care_final_cases.cjs');
for(const service of Object.keys(C.serviceActions)){
 const choices=K.choices(C,service),items=plan(service);assert(choices.length>=20);for(const g of Object.keys(K.groups))assert(g==='custom'||choices.some(i=>i.category===g),service+' missing '+g);
 for(const state of ['usual','changed','unconfirmed'])for(const mode of ['normal','long']){
  const f=facts(service,items,state,mode),runs=[];for(let seed=0;seed<30;seed++){const before=JSON.stringify(f),r=C.compose(f,null,seed);assert.deepEqual(r.errors,[]);assert(r.care.startsWith(C.INTRO));assert.equal(JSON.stringify(f),before);assert(!/安全を確認|副作用|むせ込み|転倒を防止|服用されたこと/.test(r.care));if(state==='unconfirmed')assert(!r.care.includes('職員は'));if(state!=='unconfirmed')assert(!r.needsDetail.includes(service));runs.push(r);generations++;}
  const first=runs[0];if(state==='usual'){for(const i of items){const ds=[R.describe(C,service,i)].flat();for(const d of ds)if(d.kind==='reference')assert(first.care.includes(d.text));else assert(first.care.includes(R.plain(d.text).replace(/。$/,''))||first.care.includes(R.plain(d.text).replace(/しました$/,'し'))||first.care.includes(R.plain(d.text).replace(/を介助しました$/,'の動作を職員が介助しました'))||first.care.includes(R.plain(d.text).replace('声をかけました','、短い言葉で声をかけました')),service+' '+mode+' '+d.text+' '+first.care);}}
  results.push({service,state,mode,items,stats:{visitTypes:new Set(runs.map(x=>x.visit)).size,careTypes:new Set(runs.map(x=>x.care)).size,duplicateVisits:30-new Set(runs.map(x=>x.visit)).size,duplicateCare:30-new Set(runs.map(x=>x.care)).size},runs});
 }
}
const f=facts('起床介助',[{kind:'raw',category:'custom',value:'口腔ケア、更衣促し'},{kind:'raw',category:'precaution',value:'痛い場合は無理をしない'}]);const out=C.compose(f);assert(out.care.includes('口腔ケアの支援'));assert(out.care.includes('更衣に向けて声'));assert(out.care.includes('参考情報（原文）：痛い場合は無理をしない'));assert(!out.care.includes('本人に痛みが'));
const med=facts('服薬介助・確認',[{kind:'step',category:'work',value:'服薬の状況を確認する'}]);assert(!C.compose(med).care.includes('薬を服用したこと'));const m2=structuredClone(med);m2.routineCare.services['服薬介助・確認'].items=[{kind:'action',value:'服薬したことを確認した'}];m2.supportNote='服用未確認';assert(C.compose(m2).errors.length);
const absent=facts('起床介助',plan('起床介助'));absent.scene='';absent.condition='';absent.health='';assert.equal(C.compose(absent).visit,'訪問時の状態・様子・体調は未確認です。');
const scope={organizationId:'A',clientId:'C',actorId:'staff'},seen=[];const repeated=[];for(let n=0;n<30;n++){const x=S.chooseExpression(C,f,scope,seen,n);assert.deepEqual(x.errors,[]);seen.push({organization_id:'A',client_id:'C',visit_note:x.visit,care_note:x.care});repeated.push(x);}
console.log('PASS care final',generations,'generations; all 15 x 3 states x 2 modes x 30; 8 categories, plain raw/related care, factual snapshots, medication, scoped candidate exhaustion');
if(process.env.RECORD_FINAL_OUTPUT){fs.mkdirSync(process.env.RECORD_FINAL_OUTPUT,{recursive:true});fs.writeFileSync(process.env.RECORD_FINAL_OUTPUT+'/core.json',JSON.stringify({generations,results,exhaustion:repeated},null,2));}
module.exports={plan,facts};
