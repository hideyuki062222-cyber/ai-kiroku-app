const {JSDOM}=require(process.env.JSDOM_PATH),assert=require('node:assert/strict'),fs=require('fs');
(async()=>{
 const d=new JSDOM('<select id="user"><option>101</option></select><div id="history"></div>',{url:'https://example.test/',runScripts:'outside-only'}),w=d.window;
 let filters=[],fail=false;
 const db={from:table=>{let id;const q={select:()=>q,eq:(key,val)=>{filters.push([key,val]);if(key==='client_id')id=val;return q},order:()=>q,range:async()=>fail?{error:{}}:{data:[{id:'r',created_at:'2026-10-20T01:00:00Z',service_date:'2026-10-19',service_time:'09:30:00',visit_note:id==='c1'?'<img src=x onerror=alert(1)>':'別の利用者',care_note:'支援内容'}]},then:r=>Promise.resolve({data:[{id:'c1',code:'101',is_active:true},{id:'c2',code:'102',is_active:true}]}).then(r)};return q}};
 w.eval(fs.readFileSync('record-history.js','utf8'));await w.renderClientRecordHistory(db,{organization_id:'org'});
 assert(w.document.querySelector('summary').textContent.includes('2026-10-19 09:30'));assert.equal(w.document.querySelector('img'),null);assert(filters.some(x=>x[0]==='client_id'&&x[1]==='c1'));
 w.document.querySelector('summary').click();assert(w.document.querySelector('details').open);
 const sel=w.document.querySelector('#recordHistoryClient');sel.value='c2';await sel.onchange();assert(!w.document.getElementById('history').textContent.includes('<img'));assert(w.document.getElementById('history').textContent.includes('別の利用者'));
 fail=true;await sel.onchange();assert.equal(w.document.querySelector('details'),null);assert(w.document.querySelector('[role=status]').textContent.includes('読み込めません'));
 await w.renderClientRecordHistory(db,null);assert.equal(w.document.getElementById('history').textContent,'');d.window.close();console.log('PASS history: client scoping, date/time expansion, switch clearing, escaping, errors, logout clearing');
})().catch(e=>{console.error(e);process.exit(1)});
