const fs=require('node:fs'),assert=require('node:assert/strict'),C=require('../record-facts-core'),S=require('../record-similarity'),{empty,med,cases}=require('./fixtures/record_quality_cases.cjs');
const measures=[];let checks=0;
const canonical=s=>s.replaceAll('ゆっくりと話しました','ゆっくり話しました').replaceAll('本人にゆっくり話しました','ゆっくり話しました').replaceAll('支援の際は、','').replaceAll('支援方法として、','').replace(/本人は、(服薬に向けた|食事の際の|歯磨きの|起床の|就寝準備の)声かけに(うなずいて応じられました|返事をされました)/g,'$1声かけに対し、本人は$2').replaceAll('服薬に向けた声かけに対し、','服薬に向けて声をかけると、').replaceAll('食事の際の声かけに対し、','食事の際に声をかけると、').replace(/(歯磨きの|起床の|就寝準備の)声かけに対し、/g,'$1声をかけると、').replaceAll('いたしました','しました').replaceAll('声かけを行い、','声をかけ、').replaceAll('見受けられ、','見られ、').replaceAll('いらっしゃり、','おられ、').replaceAll('の介助を行い、','を介助し、').replaceAll('を実施し、','を行い、').replaceAll('ことを確かめ、','ことを確認し、').replaceAll('の付き添いを行い、','に付き添い、').replaceAll('訪問時は、','訪問時、').replaceAll('見受けられました','見られました').replaceAll('いらっしゃいました','おられました').replaceAll('ご本人','本人').replaceAll('うなずきで','うなずいて').replaceAll('ことを確かめました','ことを確認しました').replaceAll('の介助を行いました','を介助しました').replaceAll('を実施しました','を行いました').replaceAll('声かけを行いました','声をかけました').replaceAll('の付き添いを行いました','に付き添いました').replace(/ました([、。])/g,'$1').replace(/でした([、。])/g,'で$1').replace(/[、。]/g,'');
const fixtures=[{name:'最小限・服薬サービスのみ',facts:{...empty,actions:[{service:med.service,confirmedService:true,actions:[]}]}},...Object.keys(C.serviceActions).map(service=>({name:service,facts:{...empty,scene:'ベッド端に座っていた',condition:'笑顔が見られた',actions:[{service,actions:[C.serviceActions[service][0]],reactions:[C.reactions[service][0]]}]}})),...cases.map(t=>({name:t.label,facts:t.facts}))];
for(const t of fixtures){
 const baseline=C.compose(t.facts),visits=new Set(),cares=new Set(),pairs=new Set();let min=Infinity,max=0;
 for(let seed=0;seed<5000;seed++){
  const out=C.compose(t.facts,undefined,seed);assert.deepEqual(out.errors,[]);assert(out.care.startsWith(C.INTRO));assert(!/ましました|まし、|ました、/.test(out.visit+out.care),'no double conjugation or unjoined polite clause');assert(out.care.length>=baseline.care.length*0.75&&out.care.length<=baseline.care.length*1.5,'bounded length without padding');
  // Reverse each reviewed synonym, preserving every other byte, including quotes/notes.
  assert.equal(canonical(out.visit),canonical(baseline.visit),t.name+' visit meaning');assert.equal(canonical(out.care),canonical(baseline.care),t.name+' care meaning');
  if(!t.facts.actions.some(a=>(a.actions||[]).includes('服薬したことを確認した')||(a.reactions||[]).includes('本人が自分で服薬した')))assert(!out.care.includes('服用されたことを'));
  visits.add(out.visit);cares.add(out.care);pairs.add(out.visit+'\n'+out.care);min=Math.min(min,out.care.length);max=Math.max(max,out.care.length);checks++;
 }
 measures.push({name:t.name,count:5000,visitUnique:visits.size,visitDuplicates:5000-visits.size,careUnique:cares.size,careDuplicates:5000-cares.size,pairUnique:pairs.size,pairDuplicateRate:(5000-pairs.size)/5000,minCareLength:min,maxCareLength:max,examples:[0,1,2,3].map(seed=>C.compose(t.facts,undefined,seed))});
}
const scope={organizationId:'a',clientId:'b'},f={...empty,actions:[med]},first=C.compose(f),rows=[{organization_id:'a',client_id:'b',visit_note:first.visit,care_note:first.care}];
const choice=S.chooseExpression(C,f,scope,rows,0);assert.notEqual(choice.visit+'\n'+choice.care,first.visit+'\n'+first.care);assert.equal(canonical(choice.care),canonical(first.care));
const privateNote='本人は「見られました・介助しました」と発言。';for(let i=0;i<32;i++)assert(C.compose({...f,supportNote:privateNote},undefined,i).care.includes(privateNote));
if(process.env.RECORD_VARIANT_REPORT){fs.mkdirSync(process.env.RECORD_VARIANT_REPORT,{recursive:true});fs.writeFileSync(process.env.RECORD_VARIANT_REPORT+'/results.json',JSON.stringify({checks,measures},null,2));}
console.log('PASS safe expression variants:',checks,'generations, all services, nine fact cases, exact reverse mapping, medication, untouched notes and history selection');
