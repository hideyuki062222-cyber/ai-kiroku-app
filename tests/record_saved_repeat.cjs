// Regression: reuse of saved records must outrank draft-section preferences.
const assert=require('node:assert/strict'),C=require('../record-facts-core'),S=require('../record-similarity'),old=require('./fixtures/record_similarity_before_saved_fix.cjs'),{minimal,cases,detailed}=require('./fixtures/record_evidence_cases.cjs');
const scope={organizationId:'fictional-org',clientId:'fictional-resident'},key=r=>JSON.stringify([S.normalize(r.visit),S.normalize(r.care)]),row=r=>({...scope,organization_id:scope.organizationId,client_id:scope.clientId,visit_note:r.visit,care_note:r.care});
const f={...detailed(cases[0]),lengthMode:'normal'},pool=[];const seen=new Set();
for(let i=0;i<32;i++){const out=C.compose(f,undefined,i?i*131071%1048576:0),k=key(out);if(!seen.has(k)){seen.add(k);pool.push(out);}}
let proof;
for(const previous of pool){for(const unused of pool){
 if(previous===unused||!(S.normalize(previous.visit)===S.normalize(unused.visit)||S.normalize(previous.care)===S.normalize(unused.care)))continue;
 const history=pool.filter(c=>c!==unused).map(row),before=old.chooseExpression(C,f,scope,history,0,row(previous));
 if(!history.some(r=>key(before)===key({visit:r.visit_note,care:r.care_note})))continue;
 const after=S.chooseExpression(C,f,scope,history,0,row(previous));
 assert(!after.selection.selectedExact,'unused full output must win even when it shares a draft section');assert(after.selection.unseenPairCount>0);
 proof={beforeExact:true,afterExact:false,oldCandidates:pool.length};break;
}if(proof)break;}
const beyond=S.chooseExpression(C,f,scope,pool.map(row),0,row(pool[0]));assert(beyond.selection.probeCount>32);assert(!beyond.selection.selectedExact,'search beyond an already saved initial cohort within the probe budget');
assert(proof,'counterexample is an actual output of the original 32-candidate algorithm');
const priorCare={visit:'以前の様子',care:C.INTRO+'食事を配膳しました。'};
const differentCare={visit:'再訪時の様子',care:C.INTRO+'配膳を行いました。'};
const careHistory=[priorCare,{...differentCare,visit:'別の日の様子'},{visit:differentCare.visit,care:C.INTRO+'見守りました。'}].map(row);
const carePriority={compose:(_facts,_profile,seed)=>({...((seed%2)?differentCare:{...priorCare,visit:'初回の様子'}),errors:[]})};
assert.equal(S.chooseExpression(carePriority,{},scope,careHistory,0,row(priorCare)).care,differentCare.care,'when both supporting texts were used before, vary the previous draft’s care even if its visit phrase was used before');
let checks=1;
for(const mode of ['short','normal','long'])for(const facts of [minimal,detailed(cases[0])]){
 let prior=null;const history=[];for(let n=0;n<30;n++){
  const out=S.chooseExpression(C,{...facts,lengthMode:mode},scope,history,n*2+1,prior);
  assert.deepEqual(out.errors,[]);assert(out.selection.candidateCount<=32);assert(out.selection.probeCount<=128);assert(out.selection.candidateCount<=out.selection.probeCount);
  if(out.selection.unseenPairCount)assert(!out.selection.selectedExact);
  const match=history.some(r=>key(out)===key({visit:r.visit_note,care:r.care_note}));assert.equal(out.selection.selectedExact,match);
  const foreign={...row(out),organization_id:'other'};assert.deepEqual(S.chooseExpression(C,{...facts,lengthMode:mode},scope,[foreign],n),S.chooseExpression(C,{...facts,lengthMode:mode},scope,[],n));
  history.push(row(out));prior=row(out);checks++;
 }
}
// A finite pool is allowed to repeat. Never invent a new fact to break a tie.
const constant={compose:()=>({errors:[],visit:'訪問時、体調は良好でした。',care:C.INTRO+'起床の支援を行いました。'})},first=constant.compose(),repeated=S.chooseExpression(constant,{},scope,[row(first)],0,row(first));
assert.equal(repeated.visit,first.visit);assert.equal(repeated.care,first.care);assert.equal(repeated.selection.candidateCount,1);assert.equal(repeated.selection.probeCount,128);assert.equal(repeated.selection.selectedExact,true);
assert(S.compare({...scope,visitNote:repeated.visit,careNote:repeated.care},[row(first)]).some(r=>r.kind==='exact'));
// The three limited scope phrasings change no care steps, reactions or health.
for(const level of Object.keys(C.interventionLabels))for(let seed=0;seed<128;seed++){
 const out=C.compose({...minimal,interventionLevel:level},undefined,seed);assert.deepEqual(out.errors,[]);assert.deepEqual(out.needsDetail,['起床介助']);assert(!/起き上が|返事|うなず|服用|転倒|発熱|支援後/.test(out.care));checks++;
}
console.log('PASS saved-repeat selection',checks,'cases; original bug reproduced; unseen saved pair first; 32 distinct/128 probes; scoped history; exhaustion retains true facts',JSON.stringify(proof));
