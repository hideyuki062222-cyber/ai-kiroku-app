/* Per-service care plans. Background is never an observation or performed care. */
(function(root){
 'use strict';
 const catalog=()=>typeof module!=='undefined'?require('./record-care-catalog.js'):root.NexiaCareCatalog;
 const refs=['support','personalCare','mobility','communication','legacy.support_method','legacy.communication'];
 const refLabels={support:'基本的な支援方法',personalCare:'食事・入浴などの支援方法',mobility:'移動・排泄の支援方法',communication:'コミュニケーション方法','legacy.support_method':'以前からの基本支援方法','legacy.communication':'以前からの伝え方'};
 const key=i=>i.kind+'\u0000'+i.value,unique=xs=>[...new Map(xs.map(i=>[key(i),i])).values()];
 const customEndings=[['介助する','介助しました'],['支援する','支援しました'],['を通す','を通しました'],['を整える','を整えました'],['を支える','を支えました'],['手を添える','手を添えました'],['を拭く','を拭きました'],['を洗う','を洗いました'],['を準備する','を準備しました'],['を伝える','を伝えました'],['を待つ','を待ちました'],['を行う','を行いました'],['を置く','を置きました']];
 const customForbidden=/[<>「」『』"\n。／;]|体調|反応|表情|笑顔|痛|発熱|血圧|脈拍|拒否|未確認|未実施|しない|せず|していない|なし|場合|とき|際|なら|予定|かも|不明|疑い|できる|できない|普段|通常/;
 const safeCustom=v=>typeof v==='string'&&v.length<=300&&!customForbidden.test(v)&&customEndings.some(([end])=>v.endsWith(end));
 function customSentence(v){for(const [end,past]of customEndings)if(v.endsWith(end))return v.slice(0,-end.length)+past;return v;}
 function validItem(C,service,i){return i&&Object.keys(i).every(k=>['kind','value'].includes(k))&&(i.kind==='custom'?safeCustom(i.value):({action:C.serviceActions[service],self:C.selfChoices[service]||['自分で選択した'],method:C.methodChoices})[i.kind]?.includes(i.value));}
 function validV2(C,service,i){return i&&Object.keys(i).every(k=>['kind','value','category'].includes(k))&&typeof i.value==='string'&&i.value.trim().length>0&&i.value.length<=5000&&(!i.category||Object.hasOwn(catalog().groups,i.category))&&(['step','raw'].includes(i.kind)||validItem(C,service,{kind:i.kind,value:i.value}));}
 function itemLabel(i){return (i.kind==='self'?'本人：':i.kind==='method'?'支援方法：':'')+i.value;}
 function parseDraft(C,service,note){
  const items=[],errors=[];
  for(const raw of String(note||'').split(/[\n／]/).map(s=>s.trim()).filter(Boolean)){
   let item;
   if(raw.startsWith('本人：'))item={kind:'self',value:raw.slice(3)};
   else if(raw.startsWith('支援方法：'))item={kind:'method',value:raw.slice(5)};
   else if(C.methodChoices.includes(raw))item={kind:'method',value:raw};
   else if(C.serviceActions[service]?.includes(raw))item={kind:'action',value:raw};
   else{const p=C.planMemo(raw,service);if(p.events.length===1&&['work','self'].includes(p.events[0].kind)&&p.events[0].canonical)item={kind:p.events[0].kind==='work'?'action':'self',value:p.events[0].canonical};}
   if(!item&&safeCustom(raw))item={kind:'custom',value:raw};
   if(!validItem(C,service,item))errors.push(raw);else items.push(item);
  }
  return {items:unique(items),errors};
 }
 function referenceText(entry,data={},legacy={}){
  const name=entry?.profile_ref||'';if(!refs.includes(name))return '';
  if(name.startsWith('legacy.'))return String(legacy[name.slice(7)]||'');
  const v=data[name];return [...(v?.choices||[]),v?.note||''].filter(Boolean).join('\n');
 }
 function resolve(C,service,entry,data={},legacy={}){
  const reference=referenceText(entry,data,legacy),items=(entry?.items||[]).filter(i=>entry.version===2?validV2(C,service,i):validItem(C,service,i)),ignored=[];
  const aliases={'ゆっくり話す':'ゆっくり話した','写真・絵で伝える':'写真・絵を用いて伝えた','筆談する':'筆談で伝えた','本人のペースを待つ':'本人のペースを待った','一つずつ手順を伝える':'手順を一つずつ伝えた'};
  for(const line of reference.split('\n').map(s=>s.trim()).filter(Boolean)){
   if(aliases[line])items.push({kind:'method',value:aliases[line]});
   else{const p=parseDraft(C,service,line);if(p.errors.length){if(entry?.version===2)items.push({kind:'raw',category:'custom',value:line});else ignored.push(line);}else items.push(...p.items);}
  }
  return {items:unique(items),reference,ignored,fingerprint:JSON.stringify({entry:entry||null,reference})};
 }
 const actualNote=items=>items.map(itemLabel).join('\n');
 function planActual(C,service,note){
  // Prefixes identify the actor without asking the staff to repeat selection.
  const normalized=String(note||'').split('\n').map(line=>{
   if(line.startsWith('本人：')){const v=line.slice(3);return ({'上半身を洗った':'上半身は本人が洗った','衣類を下げた':'衣類は本人が下げた','食具を操作した':'食具は本人が操作'})[v]||line;}
   return line;
  }).join('\n');
  // Known plan lines become ordinary confirmed fields. Other text remains a
  // same-day memo; it is never appended to the baseline plan.
  const items=[],rest=[];
  for(const line of normalized.split('\n')){const p=parseDraft(C,service,line);if(!p.errors.length)items.push(...p.items);else rest.push(line);}
  return {items:unique(items),note:rest.filter(Boolean).join('\n')};
 }
 function prepare(C,f){
  const s=f.routineCare;if(!s)return {facts:f,unknown:[],errors:[]};
  const errors=[],unknown=[];if(!Array.isArray(f.actions)||s.version!==1||!s.services||typeof s.services!=='object'||Array.isArray(s.services))return {facts:f,unknown:[],errors:['普段のケアの確認情報を読み直してください。']};
  const actions=f.actions.map(a=>({...a,actions:[...(a.actions||[])],methods:[...(a.methods||[])],reactions:[...(a.reactions||[])]}));
  for(const [service,x]of Object.entries(s.services)){
   const a=actions.find(a=>a.service===service);if(!a||!C.serviceActions[service]||!['unconfirmed','usual','changed'].includes(x.state)){errors.push('普段のケアとサービスの選択を確認してください。');continue;}
   if(x.state==='unconfirmed'){
    unknown.push(service);a.confirmedService=false;continue;
   }
   if(x.confirmed!==true||x.confirmedDate!==f.date||!x.actorId||x.actorId!==s.actorId||!x.confirmedAt||!Number.isFinite(Date.parse(x.confirmedAt))||!s.organizationId||!s.clientId||!Number.isInteger(x.profileRevision)||x.profileRevision<1||!x.fingerprint){errors.push(service+'：表示内容を今回実施したことを確認してください。');continue;}
   if(x.settingsVersion===2){
    if(x.state==='usual'&&(!Array.isArray(x.items)||!x.items.length||x.items.some(i=>!validV2(C,service,i)))){errors.push(service+'：普段のケアの内容を読み直してください。');continue;}
    let items=x.items||[],note='';
    if(x.state==='changed'){
     if(x.changeMode==='delta'){
      if(!Array.isArray(x.excludedIndexes)||x.excludedIndexes.some(i=>!Number.isInteger(i)||i<0||i>=items.length)||items.some(i=>!validV2(C,service,i))){errors.push(service+'：省略する手順を確認してください。');continue;}
      items=items.filter((_,i)=>!x.excludedIndexes.includes(i));note=String(x.additionNote||'');
     }else{items=[];note=String(x.actualNote||'');if(!note.trim()){errors.push(service+'：当日の実施内容を入力してください。');continue;}const actual=planActual(C,service,note);items=actual.items;note=actual.note;}
    }
    if(service==='服薬介助・確認'&&items.some(i=>i.value==='服薬したことを確認した')&&C.planMemo(note,service).events.some(e=>['uncertain','refusal'].includes(e.kind))){errors.push('服用確認と当日の未確認・拒否が重なっています。実施していない確認を省略してください。');continue;}
    a.routineNarrative={items,note};a.routineApplied=true;a.confirmedService=true;continue;
   }
   let items=[];
   if(x.state==='usual'){
    if(!Array.isArray(x.items)||!x.items.length||x.items.some(i=>x.settingsVersion===2?!validV2(C,service,i):!validItem(C,service,i))){errors.push(service+'：普段のケアの内容を読み直してください。');continue;}items=x.items;
   }else{
    if(!String(x.actualNote||'').trim()){errors.push(service+'：今日実施した内容を入力してください。');continue;}
    const actual=planActual(C,service,x.actualNote);items=actual.items;if(actual.note)a.routineNote=actual.note;
   }
   a.routineWorkOrder=items.filter(i=>['action','custom'].includes(i.kind));
   for(const i of items){if(i.kind==='action')a.actions.push(i.value);else if(i.kind==='method')a.methods.push(i.value);else if(i.kind==='custom')(a.routineCustom||(a.routineCustom=[])).push(i.value);else(a.routineSelfs||(a.routineSelfs=[])).push(i.value);}
   a.actions=[...new Set(a.actions)];a.methods=[...new Set(a.methods)];a.routineApplied=true;
   // Never use the service checkbox as evidence for an unspecified changed task.
   if(!a.actions.length&&!a.methods.length)a.confirmedService=false;
   if(a.routineNote&&!a.actions.length&&!a.methods.length&&!a.routineSelfs?.length&&!a.routineCustom?.length){a.confirmedService=true;a.routineMemoOnly=true;}
  }
  return {facts:{...f,actions},unknown,errors};
 }
 function describe(C,service,item){
  const K=catalog();if(item.kind==='self')return K.describe(C,api,service,{...item,value:'本人：'+item.value});
  if(item.kind==='method')return K.describe(C,api,service,{...item,kind:'step'});
  return K.describe(C,api,service,item);
 }
 function composeNarrative(C,a,mode,level,choose,monthly=false){
  const original=a.routineNarrative.items,detail=original.find(i=>i.value==='腰に手を添えて起き上がりを介助する');
  const reduced=original.some(i=>i.value==='服薬したことを確認した')?original.filter(i=>i.value!=='服薬の状況を確認する'):original;
  const ordered=detail&&original.some(i=>i.value==='起き上がりを介助した')?reduced.filter(i=>i!==detail).map(i=>i.value==='起き上がりを介助した'?detail:i):reduced;
  const events=[...ordered.flatMap(i=>describe(C,a.service,i)),...(a.actions||[]).map(value=>describe(C,a.service,{kind:'action',value})),...(a.self?[{kind:'self',text:plain(C.selfSentence(a.self))}]:[]),...(a.methods||[]).map(value=>describe(C,a.service,{kind:'method',value}))],refs=events.filter(e=>e.kind==='reference'),facts=[...new Map(events.filter(e=>e.kind!=='reference').map(e=>[e.text,e])).values()];
  const sentence=C.sentence,connect=s=>s.replace(/しました$/,'し').replace(/ました$/,'').replace(/でした$/,'で');
  const shortMethod=facts.findIndex(e=>e.kind==='method'&&e.text==='短い言葉で声をかけました'),prompt=facts.findIndex(e=>e.kind==='work'&&/に向けて声をかけました$/.test(e.text));
  if(shortMethod>=0&&prompt>=0){facts[prompt]={...facts[prompt],text:facts[prompt].text.replace('声をかけました','、短い言葉で声をかけました')};facts.splice(shortMethod,1);}
  const phrase=e=>choose(catalog().phraseChoices(plain(e.text),e.kind));
  const nameWorker=text=>{
   const lead=/^(食事中|排泄中|更衣中|口腔ケア中|入浴中|入浴前|就寝前|歯磨き後)(の(?=見守りを)|に|、)(.+)$/.exec(text);
   if(!lead)return monthly?choose(['職員は'+text,'職員が'+text]):'職員は'+text;
   const [,time,particle,work]=lead;
   const options=['職員は'+text,time+(particle==='に'?'に、':'は、')+'職員が'+work];
   if(monthly)options.push('職員が'+text);
   return choose(options);
  };
  const out=[];let workerNamed=false;
  for(let i=0;i<facts.length;i++){
   const e=facts[i],isWork=e.kind==='work';
   let text=phrase(e);
   if(mode==='long'&&isWork){
    if(text==='腰に手を添えて起き上がりを介助しました')text=choose(['職員は腰に手を添えて起き上がりを介助しました','本人が起き上がる動作を、職員が腰に手を添えて介助しました','腰に手を添え、職員は本人が起き上がる動作を介助しました']);
    else if(/を介助しました$/.test(text)){const target=text.replace(/を介助しました$/,'');text=choose(['職員は'+text,target+'の介助は職員が行いました',target+'は職員が介助しました']);}
    else if(!workerNamed)text=nameWorker(text);
    workerNamed=true;
   }else if(mode==='normal'&&isWork){
    if(facts[i-1]?.kind==='self')text=nameWorker(text);
    if(facts[i+1]?.kind==='work'&&/しました$/.test(text)){
     const next=phrase(facts[++i]);text=choose([connect(text)+'、'+next,text+'。'+next]);
    }
   }
   else if(isWork&&facts[i-1]?.kind==='self')text=nameWorker(text);
   if(e.kind==='self')workerNamed=false;
   out.push(sentence(text));
  }
  let body=out.join('');
  if(body&&level){
   const predicates={active:/介助/,partial:/介助/,prompt:/声|促/,watch:/見守/,minimal:/介助|支援|確認|声|促|見守/},parts=body.split('。').filter(Boolean),target=parts.findIndex(v=>predicates[level]?.test(v));
   if(target>=0){const prefix={active:'直接介助を中心に、',partial:'必要な部分への支援として、',prompt:'声かけ・促しを中心に、',watch:'見守りを中心に、',minimal:'最小限の支援として、'}[level];parts[target]=prefix+parts[target];body=parts.map(sentence).join('');}
  }
  for(const reaction of a.reactions||[])body+=sentence(plain(C.reactionSentences[reaction]||reaction));
  if(a.after)body+=sentence(plain(C.afterSentence(a.after)));
  if(a.routineNarrative.note){const memo=C.planMemo(a.routineNarrative.note,a.service);body+=C.composeMemo(memo,mode,a.service,!facts.length&&memo.hasWork?level:'',choose,plain);}
  if(a.note)body+=C.composeMemo(C.planMemo(a.note,a.service),mode,a.service,'',choose,plain);
  // Preserve reference text in the setting/snapshot and reference panel only.
  // A service checkbox plus usual confirmation supports the generic service,
  // but never turns an uninterpretable instruction into a specific action.
  if(!body&&refs.length)body=C.serviceStatements[a.service];
  if(!body)return '';
  const heading=a.service+'では、';
  return (monthly&&facts.length?choose([heading,a.service+'の際は、',a.service+'については、']):heading)+body;
 }
 function plain(value){
  if(/[「」『』"]/.test(value))return value;
  return value.replace(/行われました/g,'行いました').replace(/洗われました/g,'洗いました').replace(/磨かれました/g,'磨きました').replace(/選ばれました/g,'選びました').replace(/服用された/g,'服用した').replace(/服薬されました/g,'服薬しました').replace(/されました/g,'しました');
 }
 const api={validV2,composeNarrative,describe,safeCustom,customSentence,refs,refLabels,validItem,itemLabel,parseDraft,referenceText,resolve,actualNote,planActual,prepare,plain};
 if(typeof module!=='undefined')module.exports=api;else root.NexiaRoutineCore=api;
})(globalThis);
