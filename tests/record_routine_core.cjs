const assert=require('node:assert/strict'),C=require('../record-facts-core'),R=require('../record-routine-core'),{cases}=require('./fixtures/record_routine_cases.cjs');
let count=0;const examples=[];
for(const x of cases){
 const entry={version:1,items:x.items,profile_ref:x.ref},data={communication:{choices:['ゆっくり話す'],note:''}},src=R.resolve(C,x.service,entry,data,{});
 const base={version:1,date:'2026-11-22',scene:'ベッド上で側臥位で休んでいた',condition:'笑顔が見られた',health:'体調良好',actions:[{service:x.service,confirmedService:true,actions:[]}],routineCare:{version:1,organizationId:'A',clientId:'C',actorId:'staff',services:{}}};
 for(const state of ['usual','changed','unconfirmed'])for(const lengthMode of ['normal','long']){
  const f={...base,lengthMode,interventionLevel:state==='changed'?x.changedLevel:x.level,supportNote:state==='usual'?x.dayNote:''};
  f.routineCare={...base.routineCare,services:{[x.service]:state==='unconfirmed'?{state,confirmed:false}:{state,confirmed:true,confirmedAt:'2026-11-22T00:00:00Z',confirmedDate:f.date,actorId:'staff',profileRevision:1,fingerprint:src.fingerprint,items:src.items,actualNote:state==='changed'?x.changed:''}}};
  for(let seed=0;seed<32;seed++){
   const original=JSON.stringify(f),out=C.compose(f,{legacy:{usual:'架空の眠気・未確認の副作用'}},seed);assert.deepEqual(out.errors,[],x.service+' '+state);assert(out.care.startsWith(C.INTRO));assert(!/副作用|覚醒状態|足元/.test(out.care));assert.equal(JSON.stringify(f),original);
   if(state==='usual'){for(const a of x.anchors)assert(a.test(out.care),x.service+' missing '+a+' '+out.care);assert(!out.care.includes('未確認です'));}
   if(state==='changed'){for(const bad of x.changedForbidden)assert(!out.care.includes(bad),x.service+' carried baseline '+bad+' '+out.care);}
   if(state==='unconfirmed'){assert(out.care.includes('未確認')||out.care.includes('確認していません'));for(const bad of ['を介助しました','の介助を行いました','を行いました','服用したこと','直接介助を中心に'])assert(!out.care.includes(bad),'unchecked plan is not performed');}
   count++;
  }
  examples.push({service:x.service,state,lengthMode,entry,source:src,facts:f,result:C.compose(f)});
 }
}
const x=cases[0],f=examples.find(e=>e.service===x.service&&e.state==='usual').facts;
for(const change of [{confirmed:false},{confirmedDate:'2026-11-21'},{actorId:'other'},{items:[{kind:'reaction',value:'笑顔'}]}]){const bad=structuredClone(f);Object.assign(bad.routineCare.services[x.service],change);assert(C.compose(bad).errors.length);}
assert.equal(R.resolve(C,'起床介助',{items:[],profile_ref:'support'},{support:{choices:[],note:'笑顔で体調良好'}},{}).items.length,0,'background cannot become actual observation');
const routine=structuredClone(f);routine.routineCare.services[x.service].items=[{kind:'self',value:'薬を増量した'}];assert(C.compose(routine).errors.length,'invalid service-specific self value refused');
for(const v of ['体調良好を確認する','拒否した場合に声かけを行う','支援は予定で介助する','笑顔で洗身を介助する'])assert(!R.safeCustom(v));
assert(R.safeCustom('右腕から衣類を通す'));assert.equal(R.customSentence('右腕から衣類を通す'),'右腕から衣類を通しました');
// A usual medication confirmation must be validated with the actual care facts.
const mf=structuredClone(examples.find(e=>e.service==='服薬介助・確認'&&e.state==='usual').facts);
mf.actions[0].after='服薬後に特に変化がなかった';
assert.deepEqual(C.compose(mf).errors,[]);
const contradict=structuredClone(mf);contradict.supportNote='服用未確認';assert(C.compose(contradict).errors.length,'usual medication cannot override an unconfirmed daily memo');
mf.actions[0].reactions=['服薬を拒否した'];assert(C.compose(mf).errors.length,'usual medication cannot override refusal');
const sql=require('node:fs').readFileSync('supabase/migrations/20261122003150_resident_routine_care.sql','utf8');
const catalog=JSON.parse(sql.match(/\$catalog\$(.*?)\$catalog\$/s)[1]);
for(const service of Object.keys(C.serviceActions))assert.deepEqual(catalog[service],{action:C.serviceActions[service],self:C.selfChoices[service]||['自分で選択した'],method:C.methodChoices},'server catalog matches the shared generation catalog');
console.log('PASS routine composition',count,'generations; 5 services x 3 states x 2 lengths; no baseline carryover, explicit confirmation/date/actor, profile reference-only and immutable facts');
if(process.env.ROUTINE_OUTPUT){const fs=require('node:fs');fs.mkdirSync(process.env.ROUTINE_OUTPUT,{recursive:true});fs.writeFileSync(process.env.ROUTINE_OUTPUT+'/core.json',JSON.stringify({passed:true,count,examples},null,2));}
