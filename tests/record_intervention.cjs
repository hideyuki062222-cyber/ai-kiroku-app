const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../record-facts-core'),S=require('../record-similarity'),{empty,med,profile}=require('./fixtures/record_quality_cases.cjs');let checks=0;const rows=[];
for(const service of Object.keys(C.serviceActions))for(const level of ['',...Object.keys(C.interventionLabels)])for(const mode of ['short','normal','long']){
 const facts={...empty,lengthMode:mode,interventionLevel:level,scene:'椅子・座椅子に座っていた',health:'痛みの訴えがあった',statement:'右膝が痛い',difference:'普段より動作がゆっくりだった',actions:[{service,confirmedService:true,actions:[C.serviceActions[service][0]],reactions:[C.reactions[service][0]],methods:['ゆっくり話した'],after:'椅子に座って過ごした',note:'本人から水分の希望があった'}]},out=C.compose(facts);
 assert.deepEqual(out.errors,[]);assert(out.care.startsWith(C.INTRO));assert(out.visit.includes('右膝が痛い'));assert(out.care.includes('水分の希望'));assert(out.care.includes('ゆっくり話しました'));assert(out.care.includes('支援後は、椅子'));assert.deepEqual(out,C.compose(facts,profile));if(level)assert(out.care.includes('今回は'));else assert(!out.care.includes('今回は'));if(service==='服薬介助・確認')assert(!out.care.includes('服用されたことを'));checks++;
 if(service==='服薬介助・確認')rows.push({level,mode,result:out});
}
for(const level of Object.keys(C.interventionLabels)){
 const f={...empty,interventionLevel:level,actions:[{service:med.service,confirmedService:true,actions:[]}]},out=C.compose(f);assert(!/安全|うなず|服用された|薬を準備|副作用/.test(out.care));assert(C.compose({...f,actions:[]}).errors.length);checks++;
}
assert(C.compose({...empty,interventionLevel:'forged',actions:[med]}).errors.length);
const f={...empty,actions:[med]},scope={organizationId:'a',clientId:'b'},samples=[];let previous=null;
for(let i=0;i<100;i++){const out=S.chooseExpression(C,f,scope,samples,i,previous),row={organization_id:'a',client_id:'b',visit_note:out.visit,care_note:out.care};if(previous)assert(out.visit!==previous.visit_note||out.care!==previous.care_note,'no forced immediate pair repeat while alternatives exist');samples.push(row);previous=row;checks++;}
if(process.env.INTERVENTION_REPORT){fs.mkdirSync(process.env.INTERVENTION_REPORT,{recursive:true});fs.writeFileSync(process.env.INTERVENTION_REPORT+'/examples.json',JSON.stringify({checks,rows},null,2));}
console.log('PASS intervention:',checks,'cases: 15 services x 6 levels x 3 lengths, no inferred care, quotes, profiles, consecutive generation');
