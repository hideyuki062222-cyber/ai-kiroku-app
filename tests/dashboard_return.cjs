const {JSDOM}=require(process.env.JSDOM_PATH),fs=require('fs'),assert=require('node:assert/strict');
const script=fs.readFileSync('dashboard-return.js','utf8');
const html='<select id="workPeriod"><option>day</option><option>night</option></select><input id="workDate" type="date"><select id="assignmentScope"><option>mine</option><option>all</option></select><select id="orgSwitch"><option>org</option></select><div id="assignList"><a href="../?from=record&record=r1&assignment=a1">記録を見る</a></div><div id="todoList"><a href="../?from=assignment&assignment=a2">AI記録作成</a></div>';
(async()=>{
const d=new JSDOM(html,{url:'https://example.test/app/dashboard/',runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;
w.eval(script);w.document.getElementById('workPeriod').value='night';w.document.getElementById('workDate').value='2026-10-20';w.document.getElementById('assignmentScope').value='all';Object.defineProperty(w,'scrollY',{value:1234});
for(const selector of ['#assignList a','#todoList a']){
 const a=w.document.querySelector(selector);a.addEventListener('click',e=>e.preventDefault());a.click();
 const u=new URL(a.href),token=u.searchParams.get('returnDashboard');assert(token);assert.equal(u.searchParams.get('assignment'),selector.includes('assignList')?'a1':'a2');
 const saved=w.sessionStorage.getItem('aiKirokuDashboardReturn:'+token);
 const target=new JSDOM('<body></body>',{url:u.href,runScripts:'outside-only'});target.window.eval(script);target.window.document.dispatchEvent(new target.window.Event('DOMContentLoaded'));
 const back=target.window.document.getElementById('backToDashboard');assert(back);assert.equal(new URL(back.href).pathname,'/app/dashboard/');
 const restored=new JSDOM(html,{url:back.href,runScripts:'outside-only',pretendToBeVisual:true}),rw=restored.window;
 rw.sessionStorage.setItem('aiKirokuDashboardReturn:'+token,saved);let position;rw.scrollTo=v=>position=v.top;rw.eval(script);rw.restoreDashboardView();assert.equal(rw.document.getElementById('workPeriod').value,'night');assert.equal(rw.document.getElementById('workDate').value,'2026-10-20');assert.equal(rw.document.getElementById('assignmentScope').value,'all');assert.equal(rw.localStorage.getItem('activeOrganizationId'),'org');rw.document.dispatchEvent(new rw.Event('dashboard-ready'));await new Promise(r=>setTimeout(r,60));assert.equal(position,1234);
 restored.window.close();target.window.close();
}
assert.equal(w.history.state.dashboardView.scroll,1234);d.window.close();console.log('PASS: view/create return links; date, night shift, scope, organization and scroll restoration');
})().catch(e=>{console.error(e);process.exit(1)});
