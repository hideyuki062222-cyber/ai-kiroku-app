const assert=require('node:assert/strict'),S=require('../record-similarity.js');
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(v,m)=>{assert(v,m);checks++;};
const scope={organizationId:'facility-a',clientId:'resident-a',actorId:'staff-a'},current={...scope,visitNote:'訪問時、笑顔が見られました。',careNote:S.INTRO+'声をかけ、本人が薬を服用されたことを確認しました。'};
const row={id:'one',organization_id:scope.organizationId,client_id:scope.clientId,visit_note:current.visitNote,care_note:current.careNote,created_at:'2026-11-20T01:00:00Z'};
eq(S.compare(current,[row])[0].kind,'exact');eq(S.compare({...current,careNote:current.careNote.replace('。','。\n')},[row])[0].kind,'exact');
eq(S.compare(current,[{...row,client_id:'different-resident'},{...row,organization_id:'different-facility'}]),[]);
eq(S.compare({...current,careNote:S.INTRO},[row]),[],'the mandatory introduction alone never creates a match');
eq(S.compare(current,[{...row,care_note:S.INTRO+'排泄時の衣類の上げ下げを介助しました。'}]),[],'different service with same mandatory introduction is not similar');
eq(S.compare({...current,careNote:current.careNote+'希望あり。'},[row])[0].kind,'similar');
eq(S.dice('abc','abc'),1);eq(S.dice('',''),0);eq(S.dice('a','b'),0);eq(S.dice('ＡＢＣ。','ABC'),1);ok(S.dice('aaaa','aa')<1,'count repeated pairs correctly');
function db({actor=scope.actorId,fail='',extra=[],amendments=[]}={}){
 const log=[];return {log,auth:{getUser:async()=>({data:{user:{id:actor}}})},from:table=>{
  const entry={table,filters:[]};log.push(entry);let bounds;const q={select:v=>{entry.select=v;return q;},eq:(k,v)=>{entry.filters.push([k,v]);return q;},in:(k,v)=>{entry.filters.push([k,v]);return q;},order:()=>q,limit:v=>{entry.limit=v;return q;},range:(a,b)=>{bounds=[a,b];return q;},then:resolve=>Promise.resolve(table===fail?{error:{message:'synthetic failure'}}:{data:table==='care_records'?[row,...extra]:amendments.slice(bounds?.[0]||0,bounds?bounds[1]+1:undefined)}).then(resolve)};return q;
 }};
}
(async()=>{
 const x=db({extra:[{...row,id:'wrong',client_id:'other'}],amendments:[{organization_id:scope.organizationId,record_id:row.id,revision:2,visit_note:'訂正後の状態',care_note:'訂正後の支援'},{organization_id:scope.organizationId,record_id:row.id,revision:1,visit_note:'古い訂正',care_note:'古い訂正'}]});
 const before=JSON.stringify(row),out=await S.load(x,scope);eq(out.rows.length,1);eq(out.rows[0].care_note,'訂正後の支援');eq(x.log[0].filters,[['organization_id',scope.organizationId],['client_id',scope.clientId]]);eq(x.log[0].limit,300);eq(x.log[1].filters,[['organization_id',scope.organizationId],['record_id',[row.id]]]);
 eq(JSON.stringify(row),before,'comparison never modifies the source record');
 const lots=Array.from({length:501},(_,i)=>({organization_id:scope.organizationId,record_id:i<500?row.id:'two',revision:501-i,visit_note:'最新の観察',care_note:i<500?'一人目の最新訂正':'二人目の最新訂正'}));
 const paged=await S.load(db({extra:[{...row,id:'two'}],amendments:lots}),scope);eq(paged.rows[1].care_note,'二人目の最新訂正','latest correction across API result pages');
 for(const opts of [{actor:'other-login'},{fail:'care_records'},{fail:'care_record_amendments'}]){await assert.rejects(()=>S.load(db(opts),scope));checks++;}
 await assert.rejects(()=>S.load(db(),{}));checks++;
 eq(S.compare(current,[{...row,id:'later',created_at:'2026-11-21'},row])[0].id,'later');
 console.log('PASS record similarity:',checks,'checks: exact/near matches, introduction excluded, facility/resident IDs, signed-in actor, correction revisions, fail closed, SELECT-only bounded query');
})().catch(e=>{console.error(e);process.exitCode=1;});
