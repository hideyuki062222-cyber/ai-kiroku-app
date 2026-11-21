const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../record-facts-core.js'),{empty,med,profile,cases}=require('./fixtures/record_quality_cases.cjs');
let checks=0;const ok=(v,m)=>{assert(v,m);checks++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const facts=a=>({...empty,actions:[a]});
const generic=service=>({service,confirmedService:true,actions:[],reactions:[],methods:[],self:'',after:'',note:''});
for(const service of Object.keys(C.serviceActions)){
 const input=facts(generic(service)),out=C.compose(input,profile);
 eq(out.errors,[],service+' explicit service only');ok(out.care.startsWith(C.INTRO));
 eq(out,C.compose(input,{}),'profile is background only');eq(out,C.compose({...input,date:'2026-11-21'}),'date alone never changes wording');
 ok(out.care.length<C.INTRO.length+50,'minimal facts are not padded');
 for(const confirmedService of [false,undefined]){const candidate={...generic(service),confirmedService};if(confirmedService===undefined)delete candidate.confirmedService;ok(C.compose(facts(candidate)).errors.length>0,'candidate never becomes performed');}
 for(const action of C.serviceActions[service]){
  const r=C.compose(facts({...generic(service),actions:[action]}));eq(r.errors,[],service+'/'+action);ok(r.care.length>C.INTRO.length);
  if(service!=='服薬介助・確認')ok(r.care.includes(action.split(/を|に付き添/)[0]),'concrete object retained: '+action);
 }
}
const minimal=C.compose(facts(generic(med.service)));eq(minimal.inputCount,2,'one service and one observation count as two confirmed inputs');
for(const unobserved of ['服用された','準備を介助','飲み込み','副作用','変化は見られません'])ok(!minimal.care.includes(unobserved),'service checkbox does not infer '+unobserved);
eq(C.compose(facts({...generic(med.service),confirmedService:'true'})).care,'');
ok(C.compose(facts({...generic(med.service),after:'服薬後に特に変化がなかった'})).errors.length>0);
const prompt=facts({...generic(med.service),actions:['服薬の声かけを行った'],reactions:['声かけにうなずいて応じた']});
const reaction=C.compose(prompt);ok(reaction.care.includes('声をかけると、本人はうなずいて応じられました。'));
ok(!reaction.care.includes('服用された'));eq(reaction.care.split('うなずいて').length,2,'response appears once');
const confirmed=C.compose(facts({...med,reactions:['声かけにうなずいて応じた']}));ok(confirmed.care.includes('薬を服用されたことを確認しました'));ok(!confirmed.care.includes('副作用'));
const refused=C.compose(facts({...generic(med.service),actions:['服薬の声かけを行った'],reactions:['服薬を拒否した']}));eq(refused.errors,[]);ok(refused.care.includes('拒否されました'));ok(!refused.care.includes('服用された'));
for(const service of ['口腔ケア','起床介助','就寝介助']){
 const action=C.serviceActions[service].find(v=>v.includes('声'));
 const response=service==='起床介助'?'起床の声かけに返事をした':'声かけにうなずいて応じた';
 const r=C.compose(facts({...generic(service),actions:[action],reactions:[response]}));eq(r.errors,[]);ok(r.care.includes(service==='起床介助'?'本人は返事をされました':'本人はうなずいて応じられました'));eq(r.care.split(service==='起床介助'?'返事':'うなずいて').length,2);
}
for(const scene of ['ベッド上で仰臥位で寝ていた','ベッド上で側臥位で休んでいた','ベッド上で上体を起こしていた','ベッド端に座っていた','座ってテレビを見ていた','ベッド上でテレビを見ていた','スマートフォンを操作していた','音楽を聴いて過ごしていた','食事をしていた','飲み物を飲んでいた','室内を歩いていた','身の回りの物を整理していた','横になって休んでいた','入眠していた','起床直後だった','テレビをつけて静かに過ごしていた','何もせずゆっくり過ごしていた']){
 const r=C.compose({...facts(generic('その他')),scene,condition:''});eq(r.errors,[]);ok(!r.visit.includes('ていた。')&&!r.visit.includes('だった。'),'historical observation uses natural record tense');ok(!r.visit.includes('体調良好'),'no unobserved health');
}
const fatigue=C.compose({...facts(generic('その他')),condition:'疲れた様子が見られた',health:'疲れた様子があった'});eq(fatigue.visit.split('疲れた様子').length,2,'same observed fatigue is not repeated');
for(const t of cases){const r=C.compose(t.facts);eq(r.errors,[],t.id);for(const term of t.required)ok((r.visit+r.care).includes(term),t.id+' retains '+term);for(const term of t.forbidden)ok(!(r.visit+r.care).includes(term),t.id+' forbids '+term);}
const output=process.env.RECORD_UI_RESTORE_RESULTS;if(output){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'core.json'),JSON.stringify({passed:true,checks,services:Object.keys(C.serviceActions).length,cases:cases.map(t=>({id:t.id,label:t.label,facts:t.facts,result:C.compose(t.facts)})),minimalService:{facts:facts(generic(med.service)),result:minimal}},null,2));}
console.log('PASS record UI restore core:',checks,'checks: explicit services, all support methods, natural observations, nine fictional cases, medication and background isolation');
