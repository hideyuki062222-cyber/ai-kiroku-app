// Fictional inputs only. Verify factual coverage, not a required number of synonyms.
const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../record-facts-core'),S=require('../record-similarity'),{empty,profile}=require('./fixtures/record_quality_cases.cjs');
const scope={organizationId:'fictional-facility',clientId:'fictional-resident'},rows=[{organization_id:scope.organizationId,client_id:scope.clientId,visit_note:'保持する過去の観察',care_note:'保持する過去の支援'}];
const fixed={...empty,scene:'椅子・座椅子に座っていた',condition:'笑顔が見られた',interventionLevel:'prompt',actions:[{service:'服薬介助・確認',confirmedService:true,actions:['服薬の声かけを行った'],reactions:['声かけにうなずいて応じた'],methods:['ゆっくり話した'],unconfirmed:true,after:'椅子に座って過ごした'}]};
const rich=[
 {service:'服薬介助・確認',actions:['服薬の準備を介助した','服薬したことを確認した'],reactions:['本人が自分で服薬した'],after:'服薬後に体調の訴えがあった',required:[/服薬の準備/,/自分で薬を服用されたことを(?:確認|確かめ)/,/服薬後、本人から体調についての訴え/]},
 {service:'トイレ介助',actions:['パッドの交換を介助した'],self:'衣類を下げた',reactions:['排泄の希望を伝えた'],required:[/パッドの交換(?:を介助|の介助を行)/,/衣類を下げる動作は本人が(?:自分で)?行われました/,/本人から排泄の希望/]},
 {service:'入浴介助',actions:['背部の洗身を介助した'],self:'上半身を洗った',reactions:['湯の温度の希望を伝えた'],required:[/背部の洗身(?:を介助|の介助を行)/,/上半身は本人が自分で洗われました/,/本人から湯の温度の希望/]},
 {service:'食事介助',actions:['食事中の見守りを行った'],self:'食物を口元へ運んだ',reactions:['食べる量の希望を伝えた'],required:[/食事中の見守りを(?:行|実施)/,/食物を口元へ運ぶ動作は本人が(?:自分で)?行われました/,/本人から食べる量の希望/]}
];
let generations=0;const examples=[];
for(const mode of ['normal','long'])for(const service of Object.keys(C.serviceActions))for(let i=0;i<2;i++){
 const extra=C.supportExtras[service],f={...empty,lengthMode:mode,interventionLevel:'partial',scene:'椅子・座椅子に座っていた',statement:'今日はここで休みたい',difference:'普段より動作がゆっくりだった',concern:'時計を一度見た',supportNote:'本人は「行いました」と話した',actions:[{service,confirmedService:true,actions:[extra.actions[i]],reactions:[extra.reactions[i][0]],methods:['ゆっくり話した'],after:extra.after[i][0],note:'机の上の紙を指差した'}]},original=JSON.stringify(f);
 for(let seed=0;seed<128;seed++){
  const out=C.compose(f,profile,seed),plain=out.visit+out.care;
  assert.deepEqual(out.errors,[]);assert(out.care.startsWith(C.INTRO));assert.equal(out.care.split(C.INTRO).length,2);
  assert(out.visit.includes('今日はここで休みたい'));assert(out.visit.includes('動作がゆっくりでした'));assert(out.visit.includes('時計を一度見た'));
  assert(out.care.includes(extra.actions[i].split('を')[0]));assert(out.care.includes(extra.reactions[i][1].replace(/^本人/,'').replace(/ました$/,'')));
  assert(out.care.includes(extra.after[i][1]));assert(/ゆっくり(?:と)?話しました/.test(out.care));assert(/必要な部分(?:に介助|への支援)/.test(out.care));
  assert(out.care.includes('本人は「行いました」と話した'));assert(out.care.includes('机の上の紙を指差した'));
  assert(!/安全確認|副作用|血圧|洗身は一部介助|普段はよく話す|ましました|ました、|まし、/.test(plain));
  if(service==='服薬介助・確認')assert(!/服用されたこと|自分で服薬されました/.test(out.care));
  assert.deepEqual(out,C.compose(f,{},seed));assert.equal(JSON.stringify(f),original);
  if(mode==='long')assert(!/【|職員の支援：|本人が行ったこと：/.test(plain),'narrative, no heading-only length');
  generations++;
 }
 examples.push({service,case:i+1,mode,facts:f,result:C.compose(f)});
}
for(const x of rich)for(const mode of ['normal','long'])for(let seed=0;seed<256;seed++){
 const f={...fixed,lengthMode:mode,interventionLevel:'partial',health:'痛みの訴えがあった',statement:'右膝が痛い',difference:'普段より動作がゆっくりだった',actions:[{...x,confirmedService:true,methods:['ゆっくり話した'],after:x.after||'ベッドで休んだ',note:'本人から「水をください」との発言があった'}]},out=C.compose(f,{},seed);
 assert.deepEqual(out.errors,[]);for(const re of x.required)assert(re.test(out.care),x.service+': '+re+' in '+out.care);assert(out.visit.includes('右膝が痛い'));assert(out.visit.includes('痛みの訴え'));assert(out.care.includes('水をください'));assert(/ゆっくり(?:と)?話しました/.test(out.care));assert(!/副作用|嚥下|全身|安全確認|血圧/.test(out.care));generations++;
 if(seed===0)examples.push({service:x.service,mode,rich:true,facts:f,result:out});
}
for(const mode of ['normal','long'])for(const reaction of ['服薬を拒否した','声かけにうなずいて応じた'])for(let seed=0;seed<256;seed++){
 const f={...fixed,lengthMode:mode,actions:[{...fixed.actions[0],reactions:[reaction]}]},out=C.compose(f,profile,seed);
 assert.deepEqual(out.errors,[]);assert(out.care.includes('服用済みかは確認していません。'));assert(!/服用されたこと|本人は自分で服薬|副作用/.test(out.care));if(reaction==='服薬を拒否した')assert(/本人は服薬を拒否されました/.test(out.care));generations++;
}
// Legacy facts may have methods + self but no confirmed-service flag/action.
// Do not leave a dangling worker subject attached to the resident's own action.
for(const lengthMode of ['normal','long'])for(let seed=0;seed<128;seed++){
 const out=C.compose({...empty,lengthMode,actions:[{service:'入浴介助',actions:[],self:'上半身を洗った',methods:['ゆっくり話した']}]},undefined,seed);
 assert.deepEqual(out.errors,[]);assert(out.care.includes('上半身は本人が自分で洗われました。'));assert(/ゆっくり(?:と)?話しました。/.test(out.care));assert(!out.care.includes('職員は'));assert(!out.care.includes('洗身を介助'));generations++;
}
const stats=xs=>({unique:new Set(xs).size,repeatOccurrences:xs.length-new Set(xs).size,adjacentMatches:xs.slice(1).filter((v,i)=>v===xs[i]).length});
const thirty=[];
for(const mode of ['normal','long']){
 const f={...fixed,lengthMode:mode},runs=[];let previous=null;
 for(let n=0;n<30;n++){
  // Actual page generates once, then uses the next local seed for history selection.
  const out=S.chooseExpression(C,f,scope,rows,n*2+1,previous);assert.deepEqual(out.errors,[]);
  assert.equal(out.inputCount,C.compose(f).inputCount);
  const noHistory=S.chooseExpression(C,f,scope,[],n*2+1,previous);assert.equal(out.care,noHistory.care,'unrelated weak overlap cannot force just two recurring choices');
  assert.equal(out.visit,noHistory.visit);
  previous={organization_id:scope.organizationId,client_id:scope.clientId,visit_note:out.visit,care_note:out.care};runs.push({number:n+1,visit:out.visit,care:out.care});
 }
 thirty.push({mode,statistics:{visit:stats(runs.map(r=>r.visit)),care:stats(runs.map(r=>r.care))},facts:f,runs});
}
// Matching histories remain advisory; the user need not edit identical true facts.
const first=C.compose(fixed),exact=[{organization_id:scope.organizationId,client_id:scope.clientId,visit_note:first.visit,care_note:first.care}],selected=S.chooseExpression(C,fixed,scope,exact,0);
assert(S.compare({...scope,visitNote:first.visit,careNote:first.care},exact).some(r=>r.kind==='exact'));
assert.notEqual(selected.visit+'\n'+selected.care,first.visit+'\n'+first.care);
assert.deepEqual(S.chooseExpression(C,fixed,scope,[{...exact[0],organization_id:'other'}],0),S.chooseExpression(C,fixed,scope,[],0));
assert.deepEqual(S.chooseExpression(C,fixed,scope,[{...exact[0],client_id:'other'}],0),S.chooseExpression(C,fixed,scope,[],0));
if(process.env.RECORD_NARRATIVE_OUTPUT){fs.mkdirSync(process.env.RECORD_NARRATIVE_OUTPUT,{recursive:true});fs.writeFileSync(process.env.RECORD_NARRATIVE_OUTPUT+'/core.json',JSON.stringify({generations,thirty,examples},null,2));}
console.log('PASS narrative quality:',generations,'generations; all 15 services, two cases/length, rich self/help facts, raw quotes, uncertainty/refusal, same scoped history and 30 consecutive renders');
console.log(JSON.stringify(thirty.map(({mode,statistics})=>({mode,statistics}))));
