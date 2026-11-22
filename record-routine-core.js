/* Per-service care plans. Background is never an observation or performed care. */
(function(root){
 'use strict';
 const refs=['support','personalCare','mobility','communication','legacy.support_method','legacy.communication'];
 const refLabels={support:'基本的な支援方法',personalCare:'食事・入浴などの支援方法',mobility:'移動・排泄の支援方法',communication:'コミュニケーション方法','legacy.support_method':'以前からの基本支援方法','legacy.communication':'以前からの伝え方'};
 const key=i=>i.kind+'\u0000'+i.value,unique=xs=>[...new Map(xs.map(i=>[key(i),i])).values()];
 const customEndings=[['介助する','介助しました'],['支援する','支援しました'],['を通す','を通しました'],['を整える','を整えました'],['を支える','を支えました'],['手を添える','手を添えました'],['を拭く','を拭きました'],['を洗う','を洗いました'],['を準備する','を準備しました'],['を伝える','を伝えました'],['を待つ','を待ちました'],['を行う','を行いました'],['を置く','を置きました']];
 const customForbidden=/[<>「」『』"\n。／;]|体調|反応|表情|笑顔|痛|発熱|血圧|脈拍|拒否|未確認|未実施|しない|せず|していない|なし|場合|とき|際|なら|予定|かも|不明|疑い|できる|できない|普段|通常/;
 const safeCustom=v=>typeof v==='string'&&v.length<=300&&!customForbidden.test(v)&&customEndings.some(([end])=>v.endsWith(end));
 function customSentence(v){for(const [end,past]of customEndings)if(v.endsWith(end))return v.slice(0,-end.length)+past;return v;}
 function validItem(C,service,i){return i&&Object.keys(i).every(k=>['kind','value'].includes(k))&&(i.kind==='custom'?safeCustom(i.value):({action:C.serviceActions[service],self:C.selfChoices[service]||['自分で選択した'],method:C.methodChoices})[i.kind]?.includes(i.value));}
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
  const reference=referenceText(entry,data,legacy),items=(entry?.items||[]).filter(i=>validItem(C,service,i)),ignored=[];
  const aliases={'ゆっくり話す':'ゆっくり話した','写真・絵で伝える':'写真・絵を用いて伝えた','筆談する':'筆談で伝えた','本人のペースを待つ':'本人のペースを待った','一つずつ手順を伝える':'手順を一つずつ伝えた'};
  for(const line of reference.split('\n').map(s=>s.trim()).filter(Boolean)){
   if(aliases[line])items.push({kind:'method',value:aliases[line]});
   else{const p=parseDraft(C,service,line);if(p.errors.length)ignored.push(line);else items.push(...p.items);}
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
   let items=[];
   if(x.state==='usual'){
    if(!Array.isArray(x.items)||!x.items.length||x.items.some(i=>!validItem(C,service,i))){errors.push(service+'：普段のケアの内容を読み直してください。');continue;}items=x.items;
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
 function plain(value){
  if(/[「」『』"]/.test(value))return value;
  return value.replace(/行われました/g,'行いました').replace(/洗われました/g,'洗いました').replace(/磨かれました/g,'磨きました').replace(/選ばれました/g,'選びました').replace(/服用された/g,'服用した').replace(/服薬されました/g,'服薬しました').replace(/されました/g,'しました');
 }
 const api={safeCustom,customSentence,refs,refLabels,validItem,itemLabel,parseDraft,referenceText,resolve,actualNote,planActual,prepare,plain};
 if(typeof module!=='undefined')module.exports=api;else root.NexiaRoutineCore=api;
})(globalThis);
