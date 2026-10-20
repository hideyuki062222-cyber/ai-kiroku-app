const {JSDOM}=require(process.env.JSDOM_PATH),assert=require('node:assert/strict'),fs=require('fs');
(async()=>{
 const d=new JSDOM('<select id="user"><option>101</option></select><div id="history"></div>',{url:'https://example.test/',runScripts:'outside-only'}),w=d.window;
 let fail=false,log=[];
 const records=[
 {id:'1',organization_id:'org',client_id:'c1',assignment_id:'a',service_date:'2026-10-19',service_time:'09:00:00',created_at:'2026-10-20T02:00:00Z',visit_note:'<img src=x onerror=alert(1)>',care_note:'支援内容'},
 {id:'2',organization_id:'org',client_id:'c1',assignment_id:'a',service_date:'2026-10-19',service_time:'09:00:00',created_at:'2026-10-20T03:00:00Z',visit_note:'追加記録'},
 {id:'3',organization_id:'org',client_id:'c1',assignment_id:'b',service_date:'2026-10-19',service_time:'07:00:00',created_at:'2026-10-20T04:00:00Z'},
 {id:'4',organization_id:'org',client_id:'c1',assignment_id:null,service_date:'2026-10-19',service_time:'06:00:00',visit_note:'単独作成'},
 {id:'5',organization_id:'other',client_id:'c1',assignment_id:'x',service_date:'2026-10-19',service_time:'05:00:00'},
 {id:'6',organization_id:'org',client_id:'c2',assignment_id:'c',service_date:'2026-10-19',service_time:'10:00:00',visit_note:'別の利用者'}];
 const db={from:table=>{let filters=[],sort=[];const q={select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);log.push([k,v]);return q},not:(k,op,v)=>{filters.push(r=>r[k]!=v);return q},gte:(k,v)=>{filters.push(r=>r[k]>=v);return q},lt:(k,v)=>{filters.push(r=>r[k]<v);return q},order:(k,opt)=>{sort.push(k);return q},range:async(a,b)=>fail?{error:{}}:{data:records.filter(r=>filters.every(f=>f(r))).sort((a,b)=>{for(const k of sort){const c=String(a[k]).localeCompare(String(b[k]));if(c)return c;}return 0}).slice(a,b+1)},then:r=>Promise.resolve({data:[{id:'c1',code:'101',is_active:true},{id:'c2',code:'102',is_active:true}]}).then(r)};return q}};
 w.eval(fs.readFileSync('record-history.js','utf8'));await w.renderClientRecordHistory(db,{organization_id:'org'});
 const date=w.document.getElementById('recordHistoryDate');date.value='2026-10-19';await date.onchange();
 const summaries=[...w.document.querySelectorAll('summary')];assert.deepEqual(summaries.map(x=>x.textContent),['07:00 ／ 1件','09:00 ／ 2件']);summaries[1].click();assert(summaries[1].parentElement.open);assert.equal(w.document.querySelector('img'),null);assert(!w.document.getElementById('history').textContent.includes('単独作成'));assert(log.some(x=>x[0]==='service_date'&&x[1]==='2026-10-19'));
 assert.equal(w.document.querySelector('[data-date="2026-10-19"]').getAttribute('aria-label'),'2026-10-19 3件');
 const sel=w.document.getElementById('recordHistoryClient');sel.value='c2';await sel.onchange();assert.equal(w.document.querySelector('summary').textContent,'10:00 ／ 1件');assert(!w.document.getElementById('history').textContent.includes('追加記録'));
 date.value='2026-11-01';await date.onchange();assert.equal(w.document.querySelectorAll('summary').length,0);assert(w.document.getElementById('recordHistoryCalendar').querySelector('[data-date="2026-11-30"]'));
 fail=true;await sel.onchange();assert.equal(w.document.querySelector('details'),null);assert(w.document.querySelector('[role=status]').textContent.includes('読み込めません'));
 await w.renderClientRecordHistory(db,null);assert.equal(w.document.getElementById('history').textContent,'');d.window.close();console.log('PASS calendar: scheduled date/time (not creation), time sorting/grouping, assignment-only, client/org filters, month switching, expansion, escaping, error clearing');
})().catch(e=>{console.error(e);process.exit(1)});
