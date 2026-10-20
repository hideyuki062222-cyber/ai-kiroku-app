const {JSDOM}=require(process.env.JSDOM_PATH),assert=require('node:assert/strict'),fs=require('fs');
const records=[
 {id:'r1',organization_id:'org',client_id:'c1',assignment_id:'a1',service_date:'2026-10-19',service_time:'09:00:00',visit_note:'最初の記録'},
 {id:'r2',organization_id:'org',client_id:'c1',assignment_id:'a1',service_date:'2026-10-19',service_time:'09:00:00',visit_note:'選択した記録'},
 {id:'legacy',organization_id:'org',client_id:'c1',assignment_id:null,service_date:'2026-10-19',service_time:'07:00:00',visit_note:'旧記録'},
 {id:'foreign',organization_id:'other',client_id:'c1',assignment_id:'a1',service_date:'2026-10-19',service_time:'09:00:00'}
];
const people=[{id:'c1',organization_id:'org',code:'101',is_active:true},{id:'c2',organization_id:'org',code:'102',is_active:true}];
async function test(id,assignment='a1',fail=false){
 const d=new JSDOM('<select id="user"><option>102</option><option>101</option></select><div id="history"></div>',{url:'https://example.test/?from=record&record='+id+'&assignment='+assignment,runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;
 let scrolled=null,queries=[];w.HTMLElement.prototype.scrollIntoView=function(){scrolled=this};
 const db={from:table=>{let filters=[];const q={select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);queries.push([table,k,v]);return q},not:(k,op,v)=>{filters.push(r=>r[k]!=v);return q},gte:(k,v)=>{filters.push(r=>r[k]>=v);return q},lt:(k,v)=>{filters.push(r=>r[k]<v);return q},order:()=>q,in:()=>q};const result=()=>({data:(table==='clients'?people:table==='care_records'?records:[]).filter(r=>filters.every(f=>f(r)))});q.range=async()=>result();q.maybeSingle=async()=>fail?{error:{message:'denied'}}:{data:result().data[0]||null};q.then=(yes,no)=>Promise.resolve(result()).then(yes,no);return q}};
 w.eval(fs.readFileSync('record-history.js','utf8'));await w.renderClientRecordHistory(db,{organization_id:'org'});await new Promise(r=>w.requestAnimationFrame(r));
 return {w,d,queries,scrolled};
}
(async()=>{
 for(const id of ['r2','legacy']){
  const {w,d,queries,scrolled}=await test(id);
  const target=w.document.querySelector('.record-target');assert.equal(target.dataset.recordId,id);assert(target.parentElement.open);assert.equal(scrolled,target);assert.equal(w.document.activeElement,target);assert.equal(w.document.getElementById('user').value,'101');assert.equal(w.document.getElementById('recordHistoryClient').value,'c1');assert.equal(w.document.getElementById('recordHistoryDate').value,'2026-10-19');assert(queries.some(q=>q[0]==='care_records'&&q[1]==='id'&&q[2]===id));assert(queries.some(q=>q[0]==='care_records'&&q[1]==='organization_id'&&q[2]==='org'));
  assert.equal(w.document.querySelectorAll('.record-target').length,1);d.window.close();
 }
 for(const [id,a,fail]of [['missing','a1',false],['foreign','a1',false],['r2','wrong',false],['r2','a1',true]]){
  const {w,d}=await test(id,a,fail);assert.equal(w.document.querySelector('article'),null);assert(w.document.getElementById('history').textContent.includes('指定された保存済み記録を確認できません'));d.window.close();
 }
 // Exercise the actual dashboard renderer and its generated link.
 const html=fs.readFileSync('dashboard/index.html','utf8');const row=html.slice(html.indexOf('function assignmentRow('),html.indexOf('async function refresh()'));
 const d=new JSDOM('',{runScripts:'outside-only'}),w=d.window;w.eval("const esc=s=>String(s??'');const fmtDate=d=>d;const hhmm=t=>t.slice(0,5);const clientLabel=c=>c.code;"+row);
 const a={id:'a1',client_id:'c1',service_date:'2026-10-19',service_time:'09:00:00'},c=new Map([['c1',{code:'101'}]]);
 const done=w.assignmentRow(a,records[1],c,new Map());assert(done.includes('記録を見る'));assert(done.includes('record=r2'));assert(!done.includes('AI記録作成'));
 const todo=w.assignmentRow(a,false,c,new Map());assert(todo.includes('AI記録作成'));assert(todo.includes('from=assignment'));assert(!todo.includes('記録を見る'));d.window.close();
 console.log('PASS record deep links: exact ID, correct client/date, same-time records, legacy record, expansion, highlight, focus/scroll, denied/deleted/other-org/mismatched assignment, dashboard buttons');
})().catch(e=>{console.error(e);process.exit(1)});
