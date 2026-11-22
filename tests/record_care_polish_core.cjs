const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../record-facts-core'),R=require('../record-routine-core'),{plan,facts}=require('./fixtures/record_care_final_cases.cjs');let checks=0;
const ok=(value,message)=>{assert(value,message);checks++;};
for(const service of Object.keys(C.serviceActions))for(const mode of ['normal','long']){
 const f=facts(service,plan(service),'changed',mode),before=JSON.stringify(f),r=C.compose(f);ok(!r.errors.length);ok(r.care.includes('本人から休憩の希望がありました。'));ok(!r.care.includes('本人から休憩の希望。'));ok(!r.care.includes('休憩しました'));ok(!/手順の参考情報|原文）：/.test(r.care));ok(JSON.stringify(f)===before,'source input is not rewritten');
}
for(const raw of ['本人から休憩の希望なし','本人から休憩の希望があるか不明','本人から休憩の希望があれば対応','本人は「休憩の希望」と発言','本人から休憩の希望／実施は予定']){const p=C.planMemo(raw,'起床介助');ok(p.events.every(e=>e.kind==='raw'));ok(p.events.map(e=>e.source).join('')===raw,'unknown qualifier/quote remains literal');}
const f=facts('起床介助',[...plan('起床介助'),{kind:'raw',category:'precaution',value:'痛い場合は無理をしない'},{kind:'raw',category:'custom',value:'本人から休憩の希望'}]);for(const mode of ['normal','long']){f.lengthMode=mode;const r=C.compose(f);ok(!r.care.includes('痛い場合'));ok(!r.care.includes('休憩の希望'),'background is not a same-day request');ok(f.routineCare.services['起床介助'].items.some(i=>i.value==='痛い場合は無理をしない'));
 f.actions[0].note='本人から休憩の希望';ok(C.compose(f).care.includes('本人から休憩の希望がありました。'));f.actions[0].note='';}
const referenceOnly=facts('起床介助',[{kind:'raw',category:'precaution',value:'痛い場合は無理をしない'}]);ok(C.compose(referenceOnly).care===C.INTRO+'起床介助では、'+C.serviceStatements['起床介助'],'reference-only instructions never create specific help');
console.log('PASS prose polish',checks,'checks; 15 services x normal/long; requests, negation/quotes, references kept outside body, source/roles preserved');
