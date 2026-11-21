const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../record-facts-core'),S=require('../record-similarity'),catalog=require('./fixtures/record_support_catalog.json'),{empty}=require('./fixtures/record_quality_cases.cjs');
let checks=0;const ok=(v,m)=>{assert(v,m);checks++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};const rows=[];
eq(Object.keys(C.serviceActions),Object.keys(catalog),'the same original fifteen services');
for(const [service,x] of Object.entries(catalog)){
 eq(C.supportExtras[service],x);eq(new Set(C.serviceActions[service]).size,C.serviceActions[service].length);eq(new Set(C.reactions[service]).size,C.reactions[service].length);eq(new Set(C.afterFor(service)).size,C.afterFor(service).length);
 const base={service,confirmedService:true,actions:[],reactions:[],methods:[],self:'',after:'',note:''},minimal=C.compose({...empty,actions:[base]});eq(minimal.errors,[]);
 for(const [label,sentence] of [...x.reactions,...x.after])ok(!minimal.care.includes(sentence),'optional unselected facts stay absent: '+label);
 for(let i=0;i<2;i++){
  const facts={...empty,actions:[{...base,actions:[x.actions[i]],reactions:[x.reactions[i][0]],after:x.after[i][0]}]},out=C.compose(facts);
  eq(out.errors,[]);ok(out.care.includes(x.actions[i].split('を')[0]),'selected assistance is retained');ok(out.care.includes(x.reactions[i][1]),'reaction rendered as an observed fact');ok(out.care.includes(x.after[i][1]),'after-state rendered naturally');ok(out.care.startsWith(C.INTRO));
  for(const other of Object.values(catalog))for(const [,sentence]of [...other.reactions,...other.after])if(sentence!==x.reactions[i][1]&&sentence!==x.after[i][1])ok(!out.care.includes(sentence),'no unchecked facts');
  const unchanged=JSON.stringify(facts);for(let seed=0;seed<32;seed++){const r=C.compose(facts,undefined,seed);eq(r.errors,[]);ok(r.care.includes(x.after[i][1]));ok(!/ましました|まし、|ました、/.test(r.care));}
  eq(JSON.stringify(facts),unchanged,'rendering never mutates input');eq(out,C.compose(facts,{}));
  if(service==='服薬介助・確認')ok(!out.care.includes('服用されたことを'),'water/preparation/receipt is not dose confirmation');
  const otherService=Object.keys(catalog).find(s=>s!==service),bad={...empty,actions:[{...base,after:catalog[otherService].after[0][0]}]};ok(C.compose(bad).errors.length>0,'after-state remains bound to its own service');
  const other=C.compose({...facts,actions:[{...facts.actions[0],actions:[x.actions[1-i]],reactions:[x.reactions[1-i][0]],after:x.after[1-i][0]}]});ok(out.care!==other.care,'different confirmed facts produce different text');
  const scope={organizationId:'fictional-org',clientId:'fictional-client'},history=[{organization_id:scope.organizationId,client_id:scope.clientId,visit_note:out.visit,care_note:out.care}];
  const selected=S.chooseExpression(C,facts,scope,history,0);eq(selected.errors,[]);ok(selected.care.includes(x.after[i][1]));
  rows.push({service,case:i+1,facts,result:out,alternative:selected});
 }
}
const med={...empty,actions:[{service:'服薬介助・確認',confirmedService:true,actions:['服薬に使う水を準備した'],reactions:['薬を本人が受け取った'],after:'服薬後に特に変化がなかった'}]};ok(C.compose(med).errors.length>0,'medication after-dose state still requires confirmation');
if(process.env.RECORD_SUPPORT_OUTPUT){fs.mkdirSync(process.env.RECORD_SUPPORT_OUTPUT,{recursive:true});fs.writeFileSync(process.env.RECORD_SUPPORT_OUTPUT+'/support-cases.json',JSON.stringify({checks,rows},null,2));}
console.log('PASS support catalog:',checks,'checks, 15 services x 2 fictional cases, all 90 optional choices, exact input isolation, variations, after-state scoping, medication safeguards');
