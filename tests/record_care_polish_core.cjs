const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../record-facts-core'),R=require('../record-routine-core'),{plan,facts}=require('./fixtures/record_care_final_cases.cjs');let checks=0;
const ok=(value,message)=>{assert(value,message);checks++;};
for(const service of Object.keys(C.serviceActions))for(const mode of ['normal','long']){
 const f=facts(service,plan(service),'changed',mode),before=JSON.stringify(f),r=C.compose(f);ok(!r.errors.length);ok(r.care.includes('本人から休憩の希望がありました。'));ok(!r.care.includes('本人から休憩の希望。'));ok(!r.care.includes('休憩しました'));ok(!/手順の参考情報|原文）：/.test(r.care));ok(JSON.stringify(f)===before,'source input is not rewritten');
}
for(const raw of ['本人から休憩の希望なし','本人から休憩の希望があるか不明','本人から休憩の希望があれば対応','本人は「休憩の希望」と発言','本人から休憩の希望／実施は予定']){const p=C.planMemo(raw,'起床介助');ok(p.events.every(e=>e.kind==='raw'));ok(p.events.map(e=>e.source).join('')===raw,'unknown qualifier/quote remains literal');}
const f=facts('起床介助',[...plan('起床介助'),{kind:'raw',category:'precaution',value:'痛い場合は無理をしない'},{kind:'raw',category:'custom',value:'本人から休憩の希望'}]);for(const mode of ['normal','long']){f.lengthMode=mode;const r=C.compose(f);ok(!r.care.includes('痛い場合'));ok(!r.care.includes('休憩の希望'),'background is not a same-day request');ok(f.routineCare.services['起床介助'].items.some(i=>i.value==='痛い場合は無理をしない'));
 f.actions[0].note='本人から休憩の希望';ok(C.compose(f).care.includes('本人から休憩の希望がありました。'));f.actions[0].note='';}
const referenceOnly=facts('起床介助',[{kind:'raw',category:'precaution',value:'痛い場合は無理をしない'}]);ok(C.compose(referenceOnly).care===C.INTRO+'起床介助では、'+C.serviceStatements['起床介助'],'reference-only instructions never create specific help');

const S=require('../record-similarity'),K=require('../record-care-catalog');
const simplePlans=[
 {service:'食事介助',steps:['食事の配膳を行う','本人が食物を口元へ運ぶ','食事中の見守りを行った'],
  order:[/配膳/,/本人[^。]*口元|口元[^。]*本人/,/食事中[^。]*見守/],variants:7},
 {service:'入浴介助',steps:['入浴に向けて声をかける','浴室までの移動の見守りを行う','本人が髪を洗う','本人が体を洗う'],
  order:[/声/,/浴室[^。]*見守/,/髪[^。]*洗|洗髪/,/体[^。]*洗|洗身/],variants:7},
 {service:'更衣介助',steps:['更衣に向けて声をかける','本人が着替えを行う','更衣中の見守りを行った'],
  order:[/声/,/着替え[^。]*本人|本人[^。]*着替え|更衣の動作[^。]*本人/,/更衣中[^。]*見守/],variants:7},
 {service:'起床介助',steps:['起床に向けて声をかける'],order:[/起床[^。]*声/],variants:3}
];
for(const {service,steps,order,variants} of simplePlans)for(const mode of ['normal','long']){
 const options=K.choices(C,service);
 const items=steps.map(value=>options.find(i=>i.value===value)||{kind:'custom',value});
 const input=facts(service,items,'usual',mode);
 input.interventionLevel='';
 const original=JSON.stringify(input),scope=input.routineCare,history=[];
 for(let i=0;i<7;i++){
  const result=S.chooseExpression(C,input,scope,history,i,history.at(-1));
  ok(!result.errors.length);ok(result.care.startsWith(C.INTRO));
  let body=result.care.slice(C.INTRO.length);
  for(const fact of order){
   const match=fact.exec(body);ok(match,service+' '+mode+' '+body);
   body=body.slice(match.index+match[0].length);
  }
  ok(!/職員は本人が|支援後|完食|転倒|むせ|笑顔/.test(result.care),result.care);
  history.push({organization_id:scope.organizationId,client_id:scope.clientId,visit_note:result.visit,care_note:result.care});
 }
 ok(new Set(history.map(row=>S.normalize(row.care_note))).size>=variants,service+' '+mode+' repeats its support text');
 ok(JSON.stringify(input)===original,'choosing a phrase preserves the recorded facts');
}
console.log('PASS prose polish',checks,'checks; 15 services x normal/long; requests, negation/quotes, references kept outside body, source/roles preserved');
