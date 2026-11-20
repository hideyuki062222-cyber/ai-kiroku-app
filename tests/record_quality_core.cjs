const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),C=require('../record-facts-core.js'),before=require('./fixtures/record_facts_before_quality.cjs'),{empty,med,profile,cases}=require('./fixtures/record_quality_cases.cjs');let n=0;
const check=(v,m)=>{assert(v,m);n++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;};
const snapshots=[];
for(const test of cases){
 const result=C.compose(test.facts,test.profile),full=result.visit+'\n'+result.care;eq(result.errors,[],test.id);
 for(const v of test.required)check(full.includes(v),test.id+': missing '+v);
 for(const v of test.forbidden)check(!full.includes(v),test.id+': invented '+v);
 check(result.care.startsWith(C.INTRO));eq(result.care.split(C.INTRO).length,2);
 eq(C.compose(test.facts,{}),C.compose(test.facts,profile),'profiles do not change facts '+test.id);
 const old=JSON.parse(JSON.stringify(test.facts));delete old.lengthMode;
 for(const a of old.actions){
  const extra=a.actions.filter(v=>!before.serviceActions[a.service]?.includes(v));a.actions=a.actions.filter(v=>before.serviceActions[a.service]?.includes(v));
  if(a.self&&!['食具を操作した','衣類を着た','衣類を脱いだ','手を洗った','歯を磨いた','歩いて移動した','自分で選択した'].includes(a.self)){extra.push('本人が自分で'+a.self);a.self='';}
  a.note=[a.note,...extra,...(a.reactions||[]),...(a.methods||[]),a.unconfirmed?'服用済みかは確認していない':'',a.after].filter(Boolean).join('。');
 }
 const previous=before.compose(old);eq(previous.errors,[],'before comparison uses same explicit facts');
 const modes={};for(const mode of ['short','normal','long']){const out=C.compose({...test.facts,lengthMode:mode});eq(out.errors,[]);for(const v of test.required)check((out.visit+out.care).includes(v),mode+' preserves '+v);modes[mode]={visit:out.visit,care:out.care};}
 snapshots.push({id:test.id,label:test.label,before:previous,after:result,modes});
}
for(const service of Object.keys(C.serviceActions)){
 const action=C.serviceActions[service][0],f={...empty,actions:[{service,actions:[action],reactions:[],note:''}]};eq(C.compose(f).errors,[],service);
 for(const r of C.reactions[service]){const t={...f,actions:[{...f.actions[0],reactions:[r]}]},out=C.compose(t);eq(out.errors,[],service+'/'+r);check(out.care.length>C.INTRO.length);}
 for(const p of C.quickChoices[service]){eq(C.compose({...empty,actions:[{service,actions:p.actions,unconfirmed:p.unconfirmed}]}).errors,[],'preset '+p.id);}
}
for(const invalid of [
 {...empty,actions:[{service:med.service,actions:[]}]},
 {...empty,actions:[{...med,reactions:['服薬を拒否した']}]},
 {...empty,actions:[{...med,unconfirmed:true}]},
 {...empty,actions:[{...med,actions:[med.actions[0]],unconfirmed:true,reactions:['本人が自分で服薬した']}]},
 {...empty,actions:[{...med,actions:[med.actions[0]],after:'服薬後に特に変化がなかった'}]},
 {...empty,actions:[{...med,reactions:['勝手な反応']}]},
 {...empty,actions:[{...med,methods:['プロフィールを自動で実施扱い']}]},
 {...empty,actions:[{...med,actions:['未実施の支援']}]},
 {...empty,actions:[{...med},{...med}]}
]){const out=C.compose(invalid);check(out.errors.length>0);eq(out.care,'');eq(out.visit,'');}
eq(C.suggestions(profile),['ゆっくり話した','本人のペースを待った']);eq(C.suggestions({}),[]);
for(const m of C.methodChoices){const out=C.compose({...empty,actions:[{...med,methods:[m]}]});eq(out.errors,[]);check(!out.care.includes(m+'。'),'controlled method uses natural tense '+m);}
const missing=C.compose({...empty,condition:'',actions:[]});eq(missing.errors.length,2);eq(missing.care,'');
const same=C.compose(cases[0].facts);eq(same,C.compose(cases[0].facts));eq(same.care,C.compose({...cases[0].facts,date:'2026-11-21'}).care);
const lengthy='確認した本人の動作と発言。'.repeat(300);for(const lengthMode of ['short','normal','long'])check(C.compose({...empty,actions:[med],supportNote:lengthy,lengthMode}).care.includes(lengthy),'raw facts are not truncated');
const prepared=C.compose({...empty,actions:[{...med,actions:['服薬の準備を介助した']}]});check(!prepared.care.includes('声をかけ'));check(!prepared.care.includes('服用された'));
const folder=process.env.RECORD_QUALITY_RESULTS;if(folder){fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'comparisons.json'),JSON.stringify(snapshots,null,2));}
console.log('PASS record quality core:',n,'assertions; nine comparison cases, all services, all lengths, no inference and medication safeguards');
