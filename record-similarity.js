/* Advisory text comparison only. Uses the signed-in client's SELECT/RLS; never writes. */
(function(root){
 'use strict';
 const INTRO='指示内容確認しました。前回のサービス記録確認しました。',LIMIT=300;
 const normalize=v=>String(v||'').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').replace(/^指示内容確認しました前回のサービス記録確認しました/,'');
 function dice(a,b){
  a=normalize(a);b=normalize(b);if(!a||!b)return 0;if(a===b)return 1;if(a.length<2||b.length<2)return 0;
  const counts=new Map();for(let i=0;i<a.length-1;i++){const k=a.slice(i,i+2);counts.set(k,(counts.get(k)||0)+1);}
  let shared=0;for(let i=0;i<b.length-1;i++){const k=b.slice(i,i+2),n=counts.get(k)||0;if(n){shared++;counts.set(k,n-1);}}
  return 2*shared/(a.length+b.length-2);
 }
 function compare(current,rows){
  const v=normalize(current.visitNote),c=normalize(current.careNote);if(!c)return [];
  return rows.flatMap(r=>{
   if(r.organization_id!==current.organizationId||r.client_id!==current.clientId)return [];
   const exact=v===normalize(r.visit_note)&&c===normalize(r.care_note),care=dice(current.careNote,r.care_note),visit=dice(current.visitNote,r.visit_note);
   if(!exact&&!(care>=0.82&&(care*0.75+visit*0.25)>=0.8))return [];
   return [{...r,kind:exact?'exact':'similar',score:exact?1:care*0.75+visit*0.25}];
  }).sort((a,b)=>(b.kind==='exact')-(a.kind==='exact')||b.score-a.score||String(b.created_at||'').localeCompare(String(a.created_at||'')));
 }
 async function load(db,scope){
  if(!scope?.organizationId||!scope.clientId||!scope.actorId)throw Error('記録の参照範囲を確認できません。');
  const auth=await db.auth.getUser();if(auth.error||auth.data?.user?.id!==scope.actorId)throw Error('ログイン職員が変更されています。');
  const result=await db.from('care_records').select('id,organization_id,client_id,service_date,created_at,visit_note,care_note').eq('organization_id',scope.organizationId).eq('client_id',scope.clientId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(LIMIT);
  if(result.error)throw Error('過去記録を読み込めません。');
  const rows=(result.data||[]).filter(r=>r.organization_id===scope.organizationId&&r.client_id===scope.clientId).map(r=>({...r}));
  for(let offset=0;offset<rows.length;offset+=100){
   const batch=rows.slice(offset,offset+100),seen=new Set();
   for(let page=0;;page++){
    if(page>=20)throw Error('訂正履歴が多いため比較を完了できません。');
    const amendments=await db.from('care_record_amendments').select('record_id,organization_id,revision,visit_note,care_note').eq('organization_id',scope.organizationId).in('record_id',batch.map(r=>r.id)).order('record_id',{ascending:true}).order('revision',{ascending:false}).range(page*500,page*500+499);
    if(amendments.error)throw Error('訂正後の過去記録を読み込めません。');
    for(const a of amendments.data||[]){const r=batch.find(r=>r.id===a.record_id);if(r&&a.organization_id===scope.organizationId&&!seen.has(a.record_id)){r.visit_note=a.visit_note;r.care_note=a.care_note;seen.add(a.record_id);}}
    if((amendments.data||[]).length<500||seen.size===batch.length)break;
   }
  }
  return {rows,limit:LIMIT,atLimit:rows.length===LIMIT};
 }
 // A bounded search across fact-preserving renderings. High similarity may remain.
 function chooseExpression(core,f,scope,rows,seed,previous=null){
  const visible=rows.filter(r=>r.organization_id===scope.organizationId&&r.client_id===scope.clientId);
  const original=core.compose(f,undefined,seed);if(original.errors.length)return original;
  let best=original,bestRank=[Infinity,Infinity],bestSeed=seed;
  for(let i=0;i<32;i++){
   const candidateSeed=i===0?seed:(seed+i*131071)%1048576;
   const candidate=core.compose(f,undefined,candidateSeed);if(candidate.errors.length)continue;
   const score=visible.reduce((max,r)=>{
    if(normalize(candidate.visit)===normalize(r.visit_note)&&normalize(candidate.care)===normalize(r.care_note))return 2;
    const care=dice(candidate.care,r.care_note),weighted=0.75*care+0.25*dice(candidate.visit,r.visit_note);
    // Use the advisory check's real threshold. Weak character overlap with unrelated
    // history must not funnel every generation into the same two phrasings.
    return Math.max(max,care>=0.82&&weighted>=0.8?weighted:0);
   },0);
   const recent=previous&&previous.organization_id===scope.organizationId&&previous.client_id===scope.clientId?previous:null;
   const repeat=recent?(normalize(candidate.care)===normalize(recent.care_note)?2:0)+(normalize(candidate.visit)===normalize(recent.visit_note)?1:0):0;
   if(repeat<bestRank[0]||repeat===bestRank[0]&&score<bestRank[1]){best=candidate;bestRank=[repeat,score];bestSeed=candidateSeed;}
   if(score===0&&repeat===0)break;
  }
  return {...best,expressionSeed:bestSeed};
 }
 const api={INTRO,LIMIT,normalize,dice,compare,load,chooseExpression};if(typeof module!=='undefined')module.exports=api;else root.NexiaRecordSimilarity=api;
})(globalThis);
