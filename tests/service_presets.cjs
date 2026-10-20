const {JSDOM}=require(process.env.JSDOM_PATH);
const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const dom=new JSDOM('<div id="clientSettings"></div>',{url:'https://example.test/assignment/',runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 let saved=null,fail=false;
 const row={id:'s1',client_id:'c1',service_time:'09:00:00',is_active:true,service_contents:['食事介助']};
 Object.assign(w,{membership:{role:'admin'},organization:{id:'o1'},slots:[row],clients:[{id:'c1',code:'101'}],minute:()=>540,fmtTime:t=>t.slice(0,5),clientLabel:c=>c.code});
 w.renderClientSettings=()=>{w.document.getElementById('clientSettings').innerHTML='<div class="settings-client"><input data-times="c1"></div>'};w.loadAll=async()=>w.renderClientSettings();
 w.sb={from:()=>({update:payload=>{const q={eq:()=>q,is:()=>q,select:async()=>{if(fail)return {error:{message:'offline'}};saved=payload.service_contents;return {data:[{id:'s1'}]}}};return q}})};
 w.eval(fs.readFileSync('assignment/service-content-addon.js','utf8'));w.renderClientSettings();
 w.document.querySelector('.service-presets button').click();
 let boxes=[...w.document.querySelectorAll('dialog input')];assert.equal(boxes.length,15);assert(boxes.find(x=>x.value==='食事介助').checked);
 boxes.find(x=>x.value==='口腔ケア').checked=true;
 // Periodic schedule refresh must not discard edits in the dialog.
 w.renderClientSettings();assert(w.document.querySelector('dialog input[value="口腔ケア"]').checked);
 fail=true;await w.document.querySelector('dialog .primary').onclick();assert(w.document.querySelector('dialog'));assert(w.document.querySelector('dialog [role=status]').textContent.includes('offline'));
 fail=false;await w.document.querySelector('dialog .primary').onclick();assert.deepEqual(Array.from(saved),['食事介助','口腔ケア']);
 w.document.querySelector('.service-presets button').click();assert(w.document.querySelector('dialog input[value="口腔ケア"]').checked);
 w.membership.role='staff';w.renderClientSettings();assert.equal(w.document.querySelector('.service-presets'),null);
 dom.window.close();
 // Execute the real trusted-context loader with API test doubles.
 for(const contents of [['食事介助','口腔ケア'],[],null]){
  const d=new JSDOM('<input name="serviceContent" value="起床介助" type="checkbox" checked><input name="serviceContent" value="食事介助" type="checkbox"><input name="serviceContent" value="口腔ケア" type="checkbox"><div id="assignmentContextText"></div>',{url:'https://example.test/?from=assignment&assignment=a1',runScripts:'outside-only'}),v=d.window;
  const a={id:'a1',organization_id:'o1',client_id:'c1',service_time:'09:00:00',service_date:'2026-10-20'};
  v.db={from:table=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:table==='clients'?{id:'c1',code:'101'}:a}),maybeSingle:async()=>({data:{label:'起床',service_contents:contents}})};return q}};
  v.eval('function q(id){return document.getElementById(id)} function getDb(){return window.db}');
  const js=fs.readFileSync('record-safety.js','utf8');const start=js.indexOf('  function applyServiceLabel('),end=js.indexOf('\n  async function ',js.indexOf('  async function loadTrustedAssignmentContext(')+10);
  // Include exactly the two function declarations, before the next function.
  const rest=js.slice(start);const loaderEnd=rest.indexOf('\n  function ',rest.indexOf('async function loadTrustedAssignmentContext')+10);
  v.eval(loaderEnd>=0?rest.slice(0,loaderEnd):js.slice(start,end));
  await v.loadTrustedAssignmentContext();assert.deepEqual([...v.document.querySelectorAll('input:checked')].map(x=>x.value),contents===null?['起床介助']:contents);assert.equal(v.assignmentContext.assignmentId,'a1');v.close();
 }
 console.log('PASS: preset edit/save/reopen, polling, failure retention, staff UI, trusted multi-select, empty and legacy defaults');
})().catch(e=>{console.error(e);process.exit(1)});
