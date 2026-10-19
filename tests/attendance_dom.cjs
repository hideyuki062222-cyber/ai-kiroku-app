/* DOM integration tests: execute the real page scripts against a deterministic API double.
   Backend RLS is separately tested in attendance_rls.sql. This is not visual browser QA. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const root=path.resolve(__dirname,'..');const org='10000000-0000-4000-8000-000000000001',uid='20000000-0000-4000-8000-000000000001';
const people=[{id:'30000000-0000-4000-8000-000000000001',staff_name:'テスト本人',linked_user_id:uid,is_active:true,office_label:'テスト事業所',employment_type:'正社員',organization_id:org},{id:'30000000-0000-4000-8000-000000000002',staff_name:'テスト職員B',linked_user_id:'20000000-0000-4000-8000-000000000002',is_active:true,office_label:'テスト事業所',employment_type:'パート',organization_id:org}];
async function scenario(admin){
 const records=[];let fail=false;
 const clone=x=>structuredClone(x);
 const db={auth:{getUser:async()=>({data:{user:{id:uid}}}),onAuthStateChange:()=>{}},from(table){let filters=[],operation='select',payload,range=null;const query={select(){return this;},eq(k,v){filters.push(x=>x[k]===v);return this;},in(k,v){filters.push(x=>v.includes(x[k]));return this;},order(){return this;},range(a,b){range=[a,b];return this;},insert(x){operation='insert';payload=x;return this;},update(x){operation='update';payload=x;return this;},then(resolve,reject){try{
 if(fail&&['insert','update'].includes(operation))return Promise.resolve({error:{message:'TEST offline'}}).then(resolve,reject);
 let rows=table==='organization_members'?[{organization_id:org,user_id:uid,role:admin?'admin':'staff'}]:table==='organizations'?[{id:org,name:'テスト事業所',is_active:true}]:table==='organization_staff'?people:records;
 let found=rows.filter(x=>filters.every(f=>f(x)));
 if(operation==='insert'){if(records.some(x=>x.staff_id===payload.staff_id&&x.period===payload.period))return Promise.resolve({error:{message:'duplicate'}}).then(resolve,reject);const x={...clone(payload),revision:1};records.push(x);found=[x];}
 if(operation==='update'){found.forEach(x=>Object.assign(x,clone(payload),{revision:x.revision+1}));}
 if(range)found=found.slice(range[0],range[1]+1);return Promise.resolve({data:clone(found),error:null}).then(resolve,reject);
 }catch(e){return Promise.reject(e).then(resolve,reject);}}};return query;}};
 let html=fs.readFileSync(path.join(root,'attendance/index.html'),'utf8').replace(/<script src=[^>]+><\/script>/g,'');
 const errors=[];const dom=new JSDOM(html,{url:'https://test.invalid/ai-kiroku-app/attendance/',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){Object.assign(w,{TextEncoder,TextDecoder,Blob,Response,DecompressionStream,structuredClone,supabase:{createClient:()=>db},fetch:async()=>new Response(fs.readFileSync(path.join(root,'attendance/blank-template.xlsx'))),alert:m=>errors.push(m),confirm:()=>true,scrollTo:()=>{},print:()=>{}});w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};}});
 const w=dom.window;const inject=code=>{const s=w.document.createElement('script');s.textContent=code;w.document.body.append(s);};
 inject(fs.readFileSync(path.join(root,'attendance/cloud.js'),'utf8'));
 const read=code=>w.eval(code),el=id=>w.document.getElementById(id);
 async function until(fn){for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timeout: '+el('cloudStatus').textContent+' / '+el('cloudNotice').textContent);}
 await until(()=>read('cloudReady&&!cloudBusy'));
 assert.equal(read('sheets.length'),admin?2:1);assert.equal(el('staff').closest('label').hidden,!admin);assert.equal(el('upload').closest('details').hidden,!admin);
 el('singleMode').click();w.document.querySelector('[data-day="0"]').click();el('editType').value='A';el('editType').dispatchEvent(new w.Event('change'));el('editNote').value='保存テスト';el('editYellowNote').checked=true;el('editForm').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
 assert.equal(read('rows[0].s'),540);assert.equal(read('cloudDirty()'),true);
 await read('cloudSave()');assert.equal(records.length,1);assert.equal(records[0].rows[0].h,'保存テスト');assert.equal(read('cloudDirty()'),false);
 await read('cloudLoad()');assert.equal(read('rows[0].h'),'保存テスト');
 if(admin){el('nextStaff').click();assert.equal(read('rows[0].s'),null);el('prevStaff').click();assert.equal(read('rows[0].h'),'保存テスト');}
 el('memo').value='通信失敗';fail=true;assert.equal(await read('cloudSave()'),false);assert.equal(read('cloudDirty()'),true);assert.match(el('cloudNotice').textContent,/保存できません/);fail=false;
 records[0].revision++;assert.equal(await read('cloudSave()'),false);assert.match(el('cloudNotice').textContent,/別の端末/);
 await read('cloudLoad()');assert.equal(el('memo').value,'');
 // Keep real Excel export implementation; capture only the download sink.
 w.__downloads=[];inject('download=function(blob,name){window.__downloads.push({blob,name})};');el('export').click();assert.equal(w.__downloads.length,1);assert.equal(errors.length,0,errors.join('\n'));
 const result=w.__downloads[0];fs.writeFileSync(path.join('/tmp',admin?'attendance-admin-test.xlsx':'attendance-self-test.xlsx'),Buffer.from(await result.blob.arrayBuffer()));
 el('cloudPrint').click();assert.match(el('printSheet').textContent,/テスト本人/);assert.doesNotMatch(el('printSheet').textContent,/テスト職員B/);
 if(admin){
  const bytes=await result.blob.arrayBuffer();Object.defineProperty(el('upload'),'files',{configurable:true,value:[{name:'test.xlsx',size:bytes.byteLength,arrayBuffer:async()=>bytes}]});await el('upload').onchange();
  assert.ok(el('importReview'));const maps=[...w.document.querySelectorAll('[data-import]')];assert.equal(maps.length,2);maps.forEach((x,i)=>x.value=people[i].id);el('importConfirmed').checked=true;await el('importCommit').onclick();assert.equal(el('importReview'),null);assert.equal(records.length,2);assert.match(el('cloudNotice').textContent,/移行しました/);assert.ok(w.__downloads.some(x=>x.name.endsWith('.json')));
 }
 // Month switching must not carry the previous month's entries forward.
 const before=read('cloudPeriod()');el('month').value=el('month').value==='1'?'2':'1';await el('month').onchange();await until(()=>read('cloudReady&&!cloudBusy'));assert.notEqual(read('cloudPeriod()'),before);assert.equal(read('rows[0].s'),null);
 dom.window.close();console.log('PASS '+(admin?'admin':'staff')+': save, reload, own sheets, switches, network failure, conflict, export, print DOM');
}
(async()=>{await scenario(false);await scenario(true);})().catch(e=>{console.error(e);process.exitCode=1;});
