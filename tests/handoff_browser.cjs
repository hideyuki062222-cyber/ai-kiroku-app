// Real Chromium and the real SDK; all accounts/data/APIs are synthetic and isolated.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),assets=process.env.NEXIA_BROWSER_ASSETS||'/workspace/work/nexia-final-check';
const output=process.env.HANDOFF_BROWSER_OUTPUT||path.join(assets,'handoff-results');fs.mkdirSync(output,{recursive:true});
const R=require('../handoff/core.js'),uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [A,B,ADMIN,ONE,TWO,CA,CB,G,N,I,C,D,OLD,NIGHT,OTHER]=[1,2,11,12,13,21,22,31,32,33,34,35,36,37,38].map(uuid);
const today=R.date(),past=(()=>{const d=new Date(today+'T12:00:00+09:00');d.setUTCDate(d.getUTCDate()-1);return R.date(d)})();
const at=today+'T00:00:00Z';
function fixture(){
 const tables={organizations:[{id:A,name:'確認施設A',is_active:true,created_at:at},{id:B,name:'確認施設B',is_active:true,created_at:at}],
 organization_members:[{organization_id:A,user_id:ADMIN,role:'admin',staff_name:'確認管理者',created_at:at},{organization_id:A,user_id:ONE,role:'staff',staff_name:'確認職員',created_at:at},{organization_id:A,user_id:TWO,role:'staff',staff_name:'確認職員',created_at:at},{organization_id:B,user_id:ONE,role:'staff',staff_name:'施設Bの確認職員',created_at:at}],
 clients:[{id:CA,organization_id:A,code:'resident-test-a',room_number:'101',display_name:'確認利用者A',sort_order:1,is_active:true},{id:CB,organization_id:B,code:'resident-test-b',room_number:'201',display_name:'確認利用者B',sort_order:1,is_active:true}],
 handoff_entries:[],handoff_confirmations:[{entry_id:C,user_id:TWO,confirmed_at:at,revoked_at:null,confirmation_revision:0}],handoff_activity:[],handoff_quick_inputs:[{id:uuid(70),organization_id:A,label:'食事を全量摂取',category:'食事',sort_order:1,created_at:at}]};
 const make=(id,body,extra={})=>({id,organization_id:A,client_id:CA,service_date:today,shift:'day',body,categories:[],is_important:false,carry_over:false,resolved:false,archived:false,workflow_revision:0,created_by:ADMIN,created_at:at,updated_at:at,scope:'client',due_date:null,due_time:null,...extra});
 tables.handoff_entries=[make(G,'全体への共通連絡',{client_id:null,scope:'general'}),make(N,'通常の申し送り'),make(I,'重要：体調の変化に注意',{is_important:true}),make(C,'日勤から夜勤・翌日にも残す',{service_date:past,carry_over:true,due_date:past,due_time:'18:00:00'}),make(D,'対応日設定済みの旧申し送り',{service_date:past,due_date:today,due_time:'00:00:00'}),make(OLD,'過去の対応完了記録',{resolved:true}),make(NIGHT,'夜勤のみの申し送り',{shift:'night'}),make(uuid(39),'重要だけでは翌日へ残さない',{service_date:past,is_important:true}),make(OTHER,'別施設の申し送り',{organization_id:B,client_id:CB})];
 tables.handoff_activity.push({id:uuid(91),organization_id:A,entry_id:OLD,action:'legacy_completed',actor_user_id:null,actor_name:null,occurred_at:null,legacy:true,note:''});
 tables.handoff_activity.push({id:uuid(90),organization_id:A,entry_id:C,action:'confirmed',actor_user_id:TWO,actor_name:null,occurred_at:at,legacy:true,note:'',confirmation_revision:0});
 return tables;
}
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');let file=path.join(root,decodeURIComponent(u.pathname).replace(/^\/ai-kiroku-app\/?/,''));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{
  if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  let body=fs.readFileSync(file);
  if(u.searchParams.has('before')&&u.pathname.endsWith('/handoff/')){
   const manifest=JSON.parse(fs.readFileSync(path.join(assets,'manifest.json'))),old=manifest.find(x=>x.path==='handoff/index.html');
   let html=fs.readFileSync(old.pinned,'utf8');const i=html.lastIndexOf('</body>');html=html.slice(0,i)+'<script src="../client-room-ui.js?v=20261014-1"></script><script src="./safety-addon.js?v=20261014-4"></script><script src="../common-nav.js?v=20261028-ui&nexia=20261112-name-1"></script>'+html.slice(i);body=html;
  }
  res.writeHead(200,{'content-type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript','cache-control':'no-store'}).end(body);
 }catch{res.writeHead(404).end();}
});
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','content-type':'application/json'};
function match(value,filter){const i=filter.indexOf('.'),op=filter.slice(0,i),v=filter.slice(i+1);if(op==='eq')return String(value)===v;if(op==='lt')return String(value)<v;if(op==='gte')return String(value)>=v;if(op==='lte')return String(value)<=v;if(op==='in')return v.slice(1,-1).split(',').includes(String(value));if(op==='is')return v==='null'?value==null:String(value)===v;if(op==='not')return !match(value,v);throw Error('Unhandled filter '+filter);}
async function scenario(browser,viewport,name){
 const tables=fixture(),errors=[],blocked=[],requests=[],contexts=[],results=[];let failRead=false,loseTransitionResponse=false,loseConfirmResponse=false,insertLoseResponse=false,eventSeq=1000;
 const cache=new Map();
 const event=(entry,action,user,request,note='',revision)=>{
  const m=tables.organization_members.find(m=>m.organization_id===entry.organization_id&&m.user_id===user);
  const e={id:uuid(eventSeq++),organization_id:entry.organization_id,entry_id:entry.id,action,actor_user_id:user,actor_name:m.staff_name,occurred_at:new Date().toISOString(),note,request_id:request,workflow_revision:revision};tables.handoff_activity.push(e);return e;
 };
 const create=async(uid,before=false)=>{
  const context=await browser.newContext({viewport,isMobile:viewport.width<600,hasTouch:viewport.width<600,locale:'ja-JP',timezoneId:'Asia/Tokyo',acceptDownloads:true});contexts.push(context);
  const user={id:uid,email:'synthetic-'+uid.slice(-2)+'@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:at};
  const exp=Math.floor(Date.now()/1000)+3600,token=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',aud:'authenticated',exp})).toString('base64url')+'.synthetic';
  await context.addInitScript(({user,token,exp,A})=>{
   if(localStorage.getItem('syntheticHandoffBootstrapped'))return;localStorage.setItem('syntheticHandoffBootstrapped','1');
   localStorage.setItem('sb-pagamoaxhqszojxrpxyu-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic',expires_at:exp,token_type:'bearer',user}));if(!localStorage.getItem('activeOrganizationId'))localStorage.setItem('activeOrganizationId',A);
  },{user,token,exp,A});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.hostname==='127.0.0.1')return route.continue();
   if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/supabase-js@'))return route.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(assets,url.pathname.includes('@2.57.4/')?'supabase-2.57.4.js':'supabase-v2.js'))});
   if(url.hostname!=='pagamoaxhqszojxrpxyu.supabase.co'){blocked.push(url.origin+url.pathname);return route.abort();}
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   requests.push({method:req.method(),path:url.pathname,uid});
   const respond=(data,status=200)=>route.fulfill({status,headers,body:JSON.stringify(data)});
   if(url.pathname.endsWith('/user'))return respond(user);
   if(url.pathname.endsWith('/logout'))return route.fulfill({status:204,headers});
   const orgs=tables.organization_members.filter(m=>m.user_id===uid).map(m=>m.organization_id);
   if(req.method()==='GET'&&url.pathname.startsWith('/rest/v1/')){
    const table=url.pathname.split('/').pop();if(table==='handoff_activity'&&failRead){failRead=false;return respond({message:'Synthetic read failure'},503);}
    let list=(tables[table]||[]).filter(r=>table==='handoff_confirmations'?tables.handoff_entries.some(e=>e.id===r.entry_id&&orgs.includes(e.organization_id)):table==='organizations'?orgs.includes(r.id):orgs.includes(r.organization_id));
    list=list.filter(r=>[...url.searchParams].every(([k,v])=>['select','order','offset','limit'].includes(k)||match(r[k],v)));
    const order=url.searchParams.get('order');if(order)list.sort((a,b)=>{for(const p of order.split(',')){const [k,dir]=p.split('.');const c=String(a[k]??'').localeCompare(String(b[k]??''));if(c)return dir==='desc'?-c:c;}return 0;});
    list=list.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||1000));
    return respond(req.headers().accept?.includes('application/vnd.pgrst.object+json')?list[0]||null:list);
   }
   if(req.method()==='POST'&&url.pathname==='/rest/v1/handoff_entries'){
    const p=JSON.parse(req.postData());assert.equal(p.created_by,uid);assert(orgs.includes(p.organization_id));
    if(tables.handoff_entries.some(e=>e.id===p.id))return respond({code:'23505',message:'duplicate'},409);
    const e={...p,workflow_revision:0,archived:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};tables.handoff_entries.push(e);
    if(insertLoseResponse){insertLoseResponse=false;return respond({message:'Synthetic lost insert response'},503);}
    return respond([e]);
   }
   if(req.method()==='POST'&&url.pathname.startsWith('/rest/v1/rpc/handoff_')){
    const p=JSON.parse(req.postData());assert(orgs.includes(p.p_org));
    const e=tables.handoff_entries.find(e=>e.id===p.p_entry&&e.organization_id===p.p_org);assert(e);
    const isConfirmation=url.pathname.endsWith('handoff_set_confirmation');
    assert.deepEqual(Object.keys(p).sort(),(isConfirmation?['p_org','p_entry','p_confirmed','p_expected_revision','p_request_id']:['p_org','p_entry','p_action','p_expected_revision','p_request_id','p_note']).sort());
    const cached=cache.get(p.p_request_id);if(cached)return respond({...cached,already_applied:true});
    if(isConfirmation){
     let c=tables.handoff_confirmations.find(c=>c.entry_id===e.id&&c.user_id===uid);
     if((c?.confirmation_revision||0)!==p.p_expected_revision)return respond({message:'confirmation_conflict'},400);
     const m=tables.organization_members.find(m=>m.organization_id===p.p_org&&m.user_id===uid);
     if(!c){c={entry_id:e.id,user_id:uid,confirmation_revision:0};tables.handoff_confirmations.push(c);}
     c.confirmation_revision++;if(p.p_confirmed){c.confirmed_at=new Date().toISOString();c.revoked_at=null;c.staff_name=m.staff_name;}else c.revoked_at=new Date().toISOString();
     const a=event(e,p.p_confirmed?'confirmed':'confirmation_cancelled',uid,p.p_request_id);a.confirmation_revision=c.confirmation_revision;
     const data={organization_id:p.p_org,entry_id:e.id,user_id:uid,confirmation:c,event_id:a.id};cache.set(p.p_request_id,data);
     if(loseConfirmResponse){loseConfirmResponse=false;return respond({message:'Synthetic lost confirmation response'},503);}return respond(data);
    }
    if(e.workflow_revision!==p.p_expected_revision)return respond({message:'workflow_conflict'},400);
    if(p.p_action==='completed')e.resolved=true;if(p.p_action==='reopened')e.resolved=false;if(p.p_action==='carry')e.carry_over=true;if(p.p_action==='archived')e.archived=true;if(p.p_action==='restored')e.archived=false;e.workflow_revision++;
    const a=event(e,p.p_action,uid,p.p_request_id,p.p_note,e.workflow_revision),data={entry:{...e},event_id:a.id};cache.set(p.p_request_id,data);
    if(loseTransitionResponse){loseTransitionResponse=false;return respond({message:'Synthetic lost transition response'},503);}return respond(data);
   }
   blocked.push(req.method()+' '+url.pathname);return respond({message:'Unplanned mutation blocked'},403);
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());
  const base=`http://127.0.0.1:${server.address().port}/ai-kiroku-app/`;
  await page.goto(base+'handoff/'+(before?'?before=1':''),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('orgLabel').textContent.includes('一般職員')||document.getElementById('orgLabel').textContent.includes('管理者'));
  await page.waitForFunction(()=>window.__nexiaStaffNameReady===true);
  if(!before)await page.waitForFunction(()=>typeof loaded!=='undefined'&&loaded===true);else await page.waitForFunction(()=>document.getElementById('summary').textContent.includes('申し送り'));
  await page.waitForLoadState('networkidle',{timeout:10000});await page.waitForFunction(()=>window.__nexiaStaffNameReady===true&&!document.getElementById('nexiaStaffNameCheck'));
  return page;
 };
 const screenshot=async(page,label)=>{assert((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1,label+' overflows');await page.screenshot({path:path.join(output,name+'-'+label+'.png'),fullPage:false});};
 try{
  const before=await create(ONE,true);await screenshot(before,'before-list');await before.evaluate(cid=>openEntry(cid),CA);const beforeHeight=await before.locator('#entryOverlay .sheet').evaluate(e=>e.scrollHeight);await screenshot(before,'before-input');await before.context().close();
  console.log(name+': before/after captured');
  const one=await create(ONE),card=id=>one.locator('[data-entry-id="'+id+'"]');
  await screenshot(one,'after-list');assert(!(await one.locator('#viewManageBtn').isVisible()));
  assert.equal(await card(uuid(39)).count(),0,'important alone does not carry to next day');assert(await card(C).isVisible());assert(await card(D).isVisible());assert.equal(await card(OTHER).count(),0);
  assert((await card(OLD).innerText()).includes('対応者・対応日時は記録されていません'));assert.equal(await card(OLD).locator('[data-activity="completed"]').count(),0);
  await one.evaluate(cid=>openEntry(cid),CA);const afterHeight=await one.locator('#entryOverlay .sheet').evaluate(e=>e.scrollHeight);assert(afterHeight<beforeHeight*.75,'optional tools reduce vertical scroll');
  assert.equal(await one.locator('#entryOverlay .quick-section[open]').count(),0);await screenshot(one,'after-input');await one.evaluate(()=>hide('entryOverlay'));
  await one.locator('#shiftNight').click();assert(await card(C).isVisible());assert(await card(D).isVisible());assert.equal(await card(I).count(),0);await one.locator('#shiftAll').click();
  // Lost response + retry must preserve one confirmation history record.
  loseConfirmResponse=true;await card(N).getByRole('button',{name:'確認済みにする',exact:true}).click();await one.waitForFunction(id=>!busyEntries.has(id),N);assert.equal(tables.handoff_activity.filter(a=>a.entry_id===N&&a.action==='confirmed').length,1);
  await card(N).getByRole('button',{name:'確認済みにする',exact:true}).click();await card(N).getByRole('button',{name:'確認を取り消す',exact:true}).waitFor();assert.equal(tables.handoff_activity.filter(a=>a.entry_id===N&&a.action==='confirmed').length,1);
  const two=await create(TWO);await two.locator('[data-entry-id="'+N+'"]').getByRole('button',{name:'確認済みにする',exact:true}).click();await two.locator('[data-entry-id="'+N+'"]').getByRole('button',{name:'確認を取り消す',exact:true}).waitFor();
  await one.locator('#reloadEntries').click();await one.waitForFunction(()=>loaded===true);assert((await card(N).innerText()).includes('確認済み 2名'));
  await card(N).getByRole('button',{name:'確認を取り消す',exact:true}).click();await card(N).getByRole('button',{name:'確認済みにする',exact:true}).waitFor();assert(tables.handoff_confirmations.find(c=>c.entry_id===N&&c.user_id===TWO).revoked_at===null);assert(tables.handoff_activity.some(a=>a.entry_id===N&&a.action==='confirmation_cancelled'&&a.actor_user_id===ONE));
  await one.locator('#viewClientBtn').click();await one.waitForFunction(()=>loaded===true);
  console.log(name+': confirmations passed');
  // Completion is separate from confirmation, with an optional note and idempotent retry.
  await card(C).getByRole('button',{name:'対応完了にする',exact:true}).click();await one.locator('#actionNote').fill('連絡して対応しました');loseTransitionResponse=true;await one.locator('#actionSave').click();await one.waitForFunction(()=>document.getElementById('actionStatus').textContent.includes('入力は残しています'));
  assert.equal(await one.locator('#actionNote').inputValue(),'連絡して対応しました');assert(await one.locator('#actionNote').evaluate(e=>e.readOnly));await one.locator('#actionSave').click();await one.locator('#actionDialog').waitFor({state:'hidden'});
  assert.equal(tables.handoff_activity.filter(a=>a.entry_id===C&&a.action==='completed').length,1);assert((await card(C).innerText()).includes('連絡して対応しました'));assert(!tables.handoff_confirmations.some(c=>c.entry_id===C&&c.user_id===ONE),'completion never marks read automatically');
  await card(C).getByRole('button',{name:'対応を再開する',exact:true}).click();await one.locator('#actionNote').fill('次の勤務でも再確認');await one.locator('#actionSave').click();await one.locator('#actionDialog').waitFor({state:'hidden'});assert.equal(tables.handoff_activity.filter(a=>a.entry_id===C&&['completed','reopened'].includes(a.action)).length,2);
  // An external update while a dialog is open must reject the stale revision.
  await card(I).getByRole('button',{name:'対応完了にする',exact:true}).click();const conflicting=tables.handoff_entries.find(e=>e.id===I);conflicting.resolved=true;conflicting.workflow_revision++;event(conflicting,'completed',TWO,uuid(eventSeq++),'別端末で完了',conflicting.workflow_revision);
  await one.locator('#actionNote').fill('競合する入力');await one.locator('#actionSave').click();await one.waitForFunction(()=>document.getElementById('actionStatus').textContent.includes('別の職員'));assert(await one.locator('#actionSave').isDisabled());assert.equal(tables.handoff_activity.filter(a=>a.entry_id===I&&a.action==='completed').length,1);await one.locator('#actionDialog').getByRole('button',{name:'キャンセル',exact:true}).click();
  await one.locator('#viewDayBtn').click();await one.waitForFunction(()=>loaded===true);
  console.log(name+': workflow and conflict passed');
  // Collapse tools retain the original quick input, weight and vital functionality.
  await one.getByRole('button',{name:'＋ 申し送り',exact:true}).click();assert.equal(await one.locator('#entryClient').inputValue(),'');await one.locator('#saveBtn').click();assert((await one.locator('#entryStatus').innerText()).includes('利用者または全体'));
  await one.locator('#entryClientButton').click();await one.locator('#clientSearch').fill('101');await one.locator('#clientPickerList button').filter({hasText:'確認利用者A'}).click();
  await one.locator('#entryOverlay summary').filter({hasText:'かんたん入力'}).click();await one.locator('#templates button').first().click();await one.locator('#entryOverlay summary').filter({hasText:'体重'}).click();await one.locator('#weightInput').fill('62.8');await one.getByRole('button',{name:'追加',exact:true}).click();
  await one.locator('#entryOverlay summary').filter({hasText:'バイタル'}).click();await one.locator('#tempInput').fill('36.5');await one.getByRole('button',{name:'＋ バイタルを申し送りに追加'}).click();assert((await one.locator('#entryBody').inputValue()).includes('体重 62.8kg'));assert((await one.locator('#entryBody').inputValue()).includes('体温 36.5℃'));
  await one.locator('#important').check();await one.locator('#dueOptions summary').click();await one.locator('#dueDate').fill(today);insertLoseResponse=true;await one.locator('#saveBtn').click();await one.waitForFunction(()=>document.getElementById('entryStatus').textContent.includes('入力は残しています'));await one.locator('#saveBtn').click();await one.locator('#entryOverlay').waitFor({state:'hidden'});
  const created=tables.handoff_entries.filter(e=>e.created_by===ONE);assert.equal(created.length,1,'lost insert response does not duplicate entries');assert(created[0].is_important&&created[0].carry_over);assert.equal(created[0].client_id,CA);
  await one.locator('#dateInput').fill(R.date(new Date(today+'T12:00:00+09:00').getTime()+86400000));await one.locator('#dateInput').dispatchEvent('change');await one.waitForFunction(()=>loaded===true);assert(await card(C).isVisible());assert(await card(D).isVisible());assert(await card(created[0].id).isVisible());assert.equal(await card(I).count(),0);
  await one.getByRole('button',{name:'今日',exact:true}).click();await one.waitForFunction(()=>loaded===true);
  failRead=true;await one.locator('#reloadEntries').click();await one.waitForFunction(()=>document.getElementById('summary').textContent.includes('読み込めません'));assert.equal(await one.locator('[data-entry-id]').count(),0);await one.locator('#reloadEntries').click();await one.waitForFunction(()=>loaded===true);
  await one.reload();await one.waitForFunction(()=>loaded===true&&window.__nexiaStaffNameReady===true);assert((await card(C).innerText()).includes('確認済み 1名'));
  console.log(name+': input, next day and reload passed');
  // Administrators see all staff states and can filter by immutable identity, client and date.
  const admin=await create(ADMIN);await admin.locator('#viewManageBtn').click();await admin.waitForFunction(()=>loaded===true);const managed=id=>admin.locator('[data-entry-id="'+id+'"]');
  await managed(N).locator('.review-matrix summary').click();assert((await managed(N).locator('[data-reader="'+ONE+'"]').innerText()).includes('未確認'));assert((await managed(N).locator('[data-reader="'+TWO+'"]').innerText()).includes('確認済み'));
  await admin.locator('#reviewStaff').selectOption(TWO);await admin.locator('#reviewClient').selectOption(CA);assert(await managed(N).isVisible());await admin.locator('#metricUnread').click();assert(await managed(N).isVisible());await admin.locator('#fAll').click();await screenshot(admin,'admin-review');
  await admin.locator('#reviewStaff').selectOption('');await managed(N).getByRole('button',{name:'保管する',exact:true}).click();await admin.waitForFunction(id=>!entries.some(e=>e.id===id),N);assert(tables.handoff_entries.find(e=>e.id===N).archived);assert(tables.handoff_activity.some(a=>a.entry_id===N&&a.action==='confirmed'));
  await admin.locator('#includeArchived').check();await admin.waitForFunction(()=>loaded===true);await managed(N).getByRole('button',{name:'保管から戻す',exact:true}).click();await admin.waitForFunction(id=>entries.find(e=>e.id===id)?.archived===false,N);
  // Existing PDF action still creates the two-page report with current data.
  await admin.evaluate(()=>{window.__printed='';window.open=()=>({document:{write:s=>window.__printed=s,close:()=>{}},focus:()=>{},print:()=>{}});printPdf();});assert((await admin.evaluate(()=>window.__printed)).includes('申し送り'));assert((await admin.evaluate(()=>window.__printed)).includes('確認利用者A'));const pdf=await admin.context().newPage();await pdf.setContent(await admin.evaluate(()=>window.__printed));await pdf.pdf({path:path.join(output,name+'-handoff.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true});await pdf.close();
  // Facility switch retains authentication but never displays A data under B.
  await one.locator('#orgSwitch').selectOption(B);await one.waitForFunction(()=>typeof loaded!=='undefined'&&loaded===true&&organization.id==='00000000-0000-4000-8000-000000000002');assert.equal(await one.locator('[data-entry-id="'+N+'"]').count(),0);assert(await one.locator('[data-entry-id="'+OTHER+'"]').isVisible());
  await one.evaluate(cid=>openEntry(cid),CB);await one.locator('#entryBody').fill('ログアウト時に破棄する入力');await one.evaluate(()=>db.auth.signOut());await one.locator('#login').waitFor({state:'visible'});assert(!await one.evaluate(()=>localStorage.getItem('sb-pagamoaxhqszojxrpxyu-auth-token')));
  results.push({viewport:viewport.width,beforeInputHeight:beforeHeight,afterInputHeight:afterHeight,confirmationsAndSelfCancel:true,lostResponseRetries:true,completionAndReopen:true,concurrentUpdateRejected:true,legacyUnknownPreserved:true,dayNightAndNextDay:true,adminReview:true,archiveHistoryRetained:true,facilitySwitch:true});
  assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);console.log(JSON.stringify({name,results,requests:requests.length,errors,unexpectedRequests:blocked}));fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify({name,results,errors,blocked},null,2));
 }finally{await Promise.all(contexts.map(c=>c.close()));}
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.NEXIA_CHROMIUM||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)});try{for(const [width,name]of [[1440,'desktop'],[390,'mobile']])await scenario(browser,{width,height:900},name);}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
