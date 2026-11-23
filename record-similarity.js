/* Advisory text comparison only. Uses the signed-in client's SELECT/RLS; never writes. */
(function(root){
 'use strict';
 const INTRO='指示内容確認しました。前回のサービス記録確認しました。',LIMIT=300,MONTH_DAYS=31,PAGE_SIZE=200;
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
   const sectionMatch=current.recordDate&&((v&&v===normalize(r.visit_note))||c===normalize(r.care_note));
   if(!exact&&!sectionMatch&&!(care>=0.82&&(care*0.75+visit*0.25)>=0.8))return [];
   return [{...r,kind:exact?'exact':'similar',score:exact?1:care*0.75+visit*0.25}];
  }).sort((a,b)=>(b.kind==='exact')-(a.kind==='exact')||b.score-a.score||String(b.created_at||'').localeCompare(String(a.created_at||'')));
 }
 function dateOffset(date,days){
  const value=new Date(date+'T00:00:00Z');
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
 }
 const recordDay=row=>row.service_date||new Date(Date.parse(row.created_at)+9*3600000).toISOString().slice(0,10);
 async function load(db,scope){
  if(!scope?.organizationId||!scope.clientId||!scope.actorId)throw Error('記録の参照範囲を確認できません。');
  const auth=await db.auth.getUser();if(auth.error||auth.data?.user?.id!==scope.actorId)throw Error('ログイン職員が変更されています。');
  const query=()=>db.from('care_records').select('id,organization_id,client_id,service_date,created_at,visit_note,care_note').eq('organization_id',scope.organizationId).eq('client_id',scope.clientId);
  const fetchRows=async request=>{
   const result=await request;if(result.error)throw Error('過去記録を読み込めません。');
   return result.data||[];
  };
  let data,range;
  if(scope.recordDate){
   const end=scope.recordDate,start=dateOffset(end,-MONTH_DAYS),next=dateOffset(end,1);
   range={start,end};
   const pages=async(makeQuery)=>{
    const records=[];
    for(let offset=0;;offset+=PAGE_SIZE){
     const page=await fetchRows(makeQuery().order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+PAGE_SIZE-1));
     records.push(...page);
     if(page.length<PAGE_SIZE)return records;
    }
   };
   const [dated,legacy]=await Promise.all([
    pages(()=>query().gte('service_date',start).lte('service_date',end)),
    pages(()=>query().is('service_date',null).gte('created_at',start+'T00:00:00+09:00').lt('created_at',next+'T00:00:00+09:00'))
   ]);
   data=[...dated,...legacy].sort((a,b)=>recordDay(b).localeCompare(recordDay(a))||b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
  }else data=await fetchRows(query().order('created_at',{ascending:false}).order('id',{ascending:false}).limit(LIMIT));
  const rows=data.filter(r=>r.organization_id===scope.organizationId&&r.client_id===scope.clientId).map(r=>({...r}));
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
  return range?{rows,range}:{rows,limit:LIMIT,atLimit:rows.length===LIMIT};
 }
 // Keep at most 32 distinct, fact-preserving pairs. Different seeds can render
 // the same words; probes therefore have a separate hard limit (no network).
 const MAX_CANDIDATES=32,MAX_PROBES=128;
 const pairKey=(v,c)=>JSON.stringify([v,c]);
 const compareRank=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
 function chooseMonthly(core,f,visible,seed,previous){
  const original=core.compose(f,undefined,seed,true);
  if(original.errors.length)return original;
  const visitOptions=new Map(),careOptions=new Map(),savedPairs=new Set();
  const sections=(field,choices)=>{
   const counts=new Map();
   for(const row of visible){
    const value=normalize(row[field]);
    counts.set(value,(counts.get(value)||0)+1);
   }
   return {choices,counts,recent:normalize(previous?.[field]||visible[0]?.[field]),examples:[...counts.keys()].slice(0,7)};
  };
  const visit=sections('visit_note',visitOptions),care=sections('care_note',careOptions);
  for(const row of visible)savedPairs.add(pairKey(normalize(row.visit_note),normalize(row.care_note)));
  const probes=512;
  for(let i=0;i<probes;i++){
   const candidateSeed=i?(seed+i*131071)%1048576:seed;
   const result=i?core.compose(f,undefined,candidateSeed,true):original;
   for(const [options,text] of [[visitOptions,result.visit],[careOptions,result.care]]){
    const key=normalize(text);
    if(!options.has(key))options.set(key,{key,text,seed:candidateSeed});
   }
  }
  const rankSection=section=>[...section.choices.values()].map(option=>{
   const count=section.counts.get(option.key)||0;
   const similarities=section.examples.map(text=>dice(option.key,text));
   const rank=[Number(count>0),Number(option.key===section.recent),count,dice(option.key,section.recent),Math.max(0,...similarities)];
   return {...option,rank};
  }).sort((a,b)=>compareRank(a.rank,b.rank));
  const visits=rankSection(visit),cares=rankSection(care);
  let [v]=visits,[c]=cares;
  const pairExists=(a,b)=>savedPairs.has(pairKey(a.key,b.key));
  if(pairExists(v,c)){
   // The sections may each have appeared before. Prefer a new combination
   // when the safest available wording for both was already used together.
   const alternateVisit=visits.find(option=>!pairExists(option,c));
   const alternateCare=cares.find(option=>!pairExists(v,option));
   if(alternateCare&&(!alternateVisit||compareRank(alternateCare.rank,alternateVisit.rank)<=0))c=alternateCare;
   else if(alternateVisit)v=alternateVisit;
   else for(const nextVisit of visits){
    const nextCare=cares.find(option=>!pairExists(nextVisit,option));
    if(nextCare){v=nextVisit;c=nextCare;break;}
   }
  }
  const usedCombinations=[...savedPairs].filter(key=>{
   const [savedVisit,savedCare]=JSON.parse(key);
   return visitOptions.has(savedVisit)&&careOptions.has(savedCare);
  }).length;
  return {...original,visit:v.text,care:c.text,expressionSeed:c.seed,visitExpressionSeed:v.seed,
   selection:{visitCandidateCount:visits.length,careCandidateCount:cares.length,probeCount:probes,
    unseenPairCount:visits.length*cares.length-usedCombinations,selectedExact:pairExists(v,c)}};
 }
 function chooseExpression(core,f,scope,rows,seed,previous=null){
  const visible=rows.filter(r=>r.organization_id===scope.organizationId&&r.client_id===scope.clientId);
  const scopedPrevious=previous?.organization_id===scope.organizationId&&previous?.client_id===scope.clientId?previous:null;
  if(scope.recordDate)return chooseMonthly(core,f,visible,seed,scopedPrevious);
  const original=core.compose(f,undefined,seed);if(original.errors.length)return original;
  const counts=()=>new Map(),pairs=counts(),visits=counts(),cares=counts();
  const add=(m,k)=>m.set(k,(m.get(k)||0)+1);
  const history=visible.map(r=>{
   const v=normalize(r.visit_note),c=normalize(r.care_note),key=pairKey(v,c);
   add(pairs,key);add(visits,v);add(cares,c);return {v,c};
  });
  const recent=previous&&previous.organization_id===scope.organizationId&&previous.client_id===scope.clientId?{v:normalize(previous.visit_note),c:normalize(previous.care_note)}:null;
  const candidates=[],seen=new Set();let probes=0;
  for(let i=0;i<MAX_PROBES;i++){
   const candidateSeed=i===0?seed:(seed+i*131071)%1048576;
   const result=i===0?original:core.compose(f,undefined,candidateSeed);probes++;
   if(result.errors.length)continue;
   const v=normalize(result.visit),c=normalize(result.care),key=pairKey(v,c);
   if(seen.has(key))continue;seen.add(key);
   const candidate={result,seed:candidateSeed,v,c,key};
   if(candidates.length<MAX_CANDIDATES)candidates.push(candidate);
   else if(!pairs.has(key)){candidates[candidates.length-1]=candidate;break;}
   // After a reload, the initial cohort can already be fully saved. Continue
   // within the probe budget rather than declaring those first 32 exhausted.
   if(candidates.length===MAX_CANDIDATES&&candidates.some(c=>!pairs.has(c.key)))break;
  }
  let best=null,bestRank=null,bestSimilarity=Infinity;
  for(const candidate of candidates){
   const fullCount=pairs.get(candidate.key)||0;
   // Saved full matches must never win merely because an unused rendering shares
   // a visit/care section with the preceding draft. Section and recent-draft
   // preferences only apply AFTER avoidance of a saved full match.
   const careCount=cares.get(candidate.c)||0,visitCount=visits.get(candidate.v)||0;
   const rank=[Number(fullCount>0),Number(careCount>0),Number(candidate.c===recent?.c),Number(visitCount>0),Number(candidate.v===recent?.v),careCount,fullCount];
   const order=bestRank?compareRank(rank,bestRank):-1;if(order>0)continue;
   const similarity=history.reduce((max,r)=>{
    const care=dice(candidate.c,r.c),weighted=0.75*care+0.25*dice(candidate.v,r.v);
    return Math.max(max,care>=0.82&&weighted>=0.8?weighted:0);
   },0);
   if(order<0||similarity<bestSimilarity){best=candidate;bestRank=rank;bestSimilarity=similarity;}
  }
  return {...best.result,expressionSeed:best.seed,selection:{candidateCount:candidates.length,probeCount:probes,unseenPairCount:candidates.filter(c=>!pairs.has(c.key)).length,selectedExact:pairs.has(best.key)}};
 }

 const api={INTRO,LIMIT,MAX_CANDIDATES,MAX_PROBES,normalize,dice,compare,load,chooseExpression};if(typeof module!=='undefined')module.exports=api;else root.NexiaRecordSimilarity=api;
})(globalThis);
