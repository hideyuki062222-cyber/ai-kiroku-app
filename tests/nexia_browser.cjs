// Real Chromium, synthetic accounts and API responses only. All remote requests are intercepted.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),assets=process.env.NEXIA_BROWSER_ASSETS||path.join(root,'work','nexia-browser-assets');
const artifact=process.env.NEXIA_BROWSER_OUTPUT||path.join(assets,process.env.NEXIA_BASELINE?'baseline-results':'browser-results');fs.mkdirSync(artifact,{recursive:true});
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',U='20000000-0000-4000-8000-000000000001';
const CA='30000000-0000-4000-8000-000000000001',CB='30000000-0000-4000-8000-000000000002',S='40000000-0000-4000-8000-000000000001';
const AS='50000000-0000-4000-8000-000000000001';
const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const now=new Date().toISOString();
function database(){
 const tables={
  organizations:[{id:A,name:'確認用施設A',join_code:'SYNTHETIC',is_active:true,created_at:now},{id:B,name:'確認用施設B',join_code:'SYNTHETIC',is_active:true,created_at:now}],
  organization_members:[{organization_id:A,user_id:U,role:'admin',staff_name:'確認用管理者',created_at:now},{organization_id:B,user_id:U,role:'staff',staff_name:'確認用職員',created_at:now}],
  organization_staff:[{id:S,organization_id:A,staff_name:'氏名未設定',linked_user_id:U,is_active:true,office_label:'確認用施設A',employment_type:'常勤',sort_order:1,created_at:now},{id:'40000000-0000-4000-8000-000000000002',organization_id:B,staff_name:'古い施設Bの氏名',linked_user_id:U,is_active:true,office_label:'確認用施設B',employment_type:'常勤',sort_order:1,created_at:now}],
  clients:[{id:CA,organization_id:A,code:'101',display_name:'サンプル利用者A',room_number:'101',is_active:true,sort_order:1,usual:'確認用',trait:'',caution:'',communication:'',support_method:'',care_intro:''},{id:CB,organization_id:B,code:'201',display_name:'サンプル利用者B',room_number:'201',is_active:true,sort_order:1,usual:'',trait:'',caution:'',communication:'',support_method:'',care_intro:''}],
  client_service_slots:[{id:'slot-a',organization_id:A,client_id:CA,service_time:'09:00:00',label:'身体介護',days_of_week:[0,1,2,3,4,5,6],service_contents:['移動介助'],is_active:true}],
  staff_assignments:[{id:AS,organization_id:A,client_id:CA,service_date:date,service_time:'09:00:00',assigned_user_id:U,assigned_staff_id:S,assigned_staff_name:'確認用管理者',memo:'確認用の担当',created_by:U,updated_by:U}],
  care_records:[],handoff_entries:[],handoff_quick_inputs:[],handoff_confirmations:[],attendance_months:[],
  cashbook_accounts:[{organization_id:A,client_id:CA,opening_balance:1000}],
  cashbook_entries:[{id:'entry-a',organization_id:A,client_id:CA,tx_date:date,kind:'expense',amount:100,item:'確認用消耗品',store:'確認用店舗',memo:'テストデータ',created_by:U,created_by_name:'確認用管理者',created_at:now,updated_by:U}],
  cashbook_choices:[],meal_entries:[],meal_prices:[],meal_profiles:[]
 };
 for(const [org,id] of [[A,'40000000-0000-4000-8000-000000000003'],[B,'40000000-0000-4000-8000-000000000004']])tables.organization_staff.push({id,organization_id:org,staff_name:'確認用代理入力職員',linked_user_id:null,is_active:true,office_label:'確認用施設',employment_type:'非常勤',sort_order:2,created_at:now});
 for(const c of tables.clients)tables.meal_profiles.push({organization_id:c.organization_id,client_id:c.id,start_date:date.slice(0,7)+'-01',end_date:null,morning:true,lunch:true,evening:true,weekdays:[0,1,2,3,4,5,6],rice_morning:150,rice_lunch:150,rice_evening:150,food_form:'常食',revision:1,note:''});
 return tables;
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');const serveRoot=req.headers.cookie?.includes('nexiaBaseline=1')?process.env.NEXIA_BASELINE_ROOT:root;let file=path.join(serveRoot,decodeURIComponent(u.pathname).replace(/^\/ai-kiroku-app\/?/,''));
 if(!file.startsWith(serveRoot+path.sep)&&file!==serveRoot){res.writeHead(403).end();return}
 try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');const body=fs.readFileSync(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}catch{res.writeHead(404).end()}
});
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS,HEAD','content-type':'application/json'};
function matches(value,filter){
 const dot=filter.indexOf('.'),op=filter.slice(0,dot),v=filter.slice(dot+1);
 if(op==='eq')return String(value)===v;if(op==='in')return v.slice(1,-1).split(',').includes(String(value));
 if(op==='gte')return String(value)>=v;if(op==='lte')return String(value)<=v;if(op==='gt')return String(value)>v;if(op==='lt')return String(value)<v;
 if(op==='is')return v==='null'?value==null:String(value)===v;
 if(op==='not')return !matches(value,v);
 return true;
}
async function scenario(browser,viewport,name){
 const tables=database(),requests=[],blocked=[],errors=[],results=[],dialogs=[];
 let allowNameWrite=false,failNameSave=false,nameWriteAttempts=0,nameWrites=0,failDirectory=false,invalidDirectory=false,failAdminRename=false,renameWrites=0;
 const canonicalUpdate=(org,uid,name)=>{
  tables.organization_members.find(m=>m.organization_id===org&&m.user_id===uid).staff_name=name;
  for(const row of tables.organization_staff.filter(s=>s.organization_id===org&&s.linked_user_id===uid))row.staff_name=name;
 };
 const directory=()=>tables.organization_staff.map(s=>{
  const member=tables.organization_members.find(m=>m.organization_id===s.organization_id&&m.user_id===s.linked_user_id);
  return {...s,staff_name:s.linked_user_id?member?.staff_name:s.staff_name,name_user_id:member?.user_id||null};
 });
 const context=await browser.newContext({viewport,isMobile:viewport.width<600,hasTouch:viewport.width<600,locale:'ja-JP',timezoneId:'Asia/Tokyo',acceptDownloads:true});
 const user={id:U,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',email_confirmed_at:now,created_at:now,app_metadata:{provider:'email',providers:['email']},user_metadata:{}};
 const exp=Math.floor(Date.now()/1000)+3600;
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:U,aud:'authenticated',role:'authenticated',exp,iss:'https://pagamoaxhqszojxrpxyu.supabase.co/auth/v1'})).toString('base64url')+'.synthetic';
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.hostname==='127.0.0.1')return route.continue();
  if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/supabase-js@'))return route.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(assets,url.pathname.includes('@2.57.4/')?'supabase-2.57.4.js':'supabase-v2.js'))});
  if(['raw.githubusercontent.com','cdn.jsdelivr.net'].includes(url.hostname)){
   const entry=JSON.parse(fs.readFileSync(path.join(assets,'manifest.json'))).sort((a,b)=>b.path.length-a.path.length).find(e=>url.pathname.endsWith('/'+e.path));
   if(entry)return route.fulfill({status:200,contentType:'text/plain',body:fs.readFileSync(entry.pinned)});
  }
  if(url.hostname==='pagamoaxhqszojxrpxyu.supabase.co'){
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   requests.push({path:url.pathname,method:req.method()});
   if(url.pathname.endsWith('/token'))return route.fulfill({status:200,headers,body:JSON.stringify({access_token:token,token_type:'bearer',expires_in:3600,expires_at:exp,refresh_token:'synthetic-refresh',user})});
   if(url.pathname.endsWith('/user'))return route.fulfill({status:200,headers,body:JSON.stringify(user)});
   if(url.pathname.endsWith('/logout'))return route.fulfill({status:204,headers});
   if(allowNameWrite&&url.pathname==='/rest/v1/organization_members'&&req.method()==='PATCH'){
    const payload=JSON.parse(req.postData());assert.deepEqual(Object.keys(payload),['staff_name']);assert.equal(url.searchParams.get('user_id'),'eq.'+U);assert([A,B].some(id=>url.searchParams.get('organization_id')==='eq.'+id));nameWriteAttempts++;
    if(failNameSave){failNameSave=false;return route.fulfill({status:503,headers,body:JSON.stringify({message:'Synthetic save failure'})})}
    const rows=tables.organization_members.filter(r=>[...url.searchParams].every(([k,v])=>k==='select'||matches(r[k],v)));rows.forEach(r=>canonicalUpdate(r.organization_id,r.user_id,payload.staff_name));nameWrites+=rows.length;
    return route.fulfill({status:200,headers,body:JSON.stringify(rows)});
   }
   if(url.pathname==='/rest/v1/rpc/rename_organization_staff'){
    const p=JSON.parse(req.postData());assert.deepEqual(Object.keys(p).sort(),['p_expected_name','p_expected_user','p_name','p_org','p_staff']);assert.equal(p.p_org,A);
    const target=directory().find(r=>r.id===p.p_staff&&r.organization_id===p.p_org);assert(target);assert.equal(target.linked_user_id,p.p_expected_user);assert.equal(target.staff_name,p.p_expected_name);
    if(failAdminRename){failAdminRename=false;return route.fulfill({status:503,headers,body:JSON.stringify({message:'Synthetic rename failure'})})}
    if(target.linked_user_id)canonicalUpdate(p.p_org,target.linked_user_id,p.p_name);
    else tables.organization_staff.find(s=>s.id===target.id).staff_name=p.p_name;
    renameWrites++;
    return route.fulfill({status:200,headers,body:JSON.stringify(directory().filter(s=>s.id===target.id).map(({id,organization_id,linked_user_id,staff_name})=>({id,organization_id,linked_user_id,staff_name})))});
   }
   if(url.pathname.includes('/rpc/list_organization_staff'))return route.fulfill({status:200,headers,body:JSON.stringify(tables.organization_members.filter(m=>m.organization_id===JSON.parse(req.postData()).p_org).map(m=>({...m,email:user.email})))});
   if(url.pathname.startsWith('/rest/v1/')&&['GET','HEAD'].includes(req.method())){
    const table=url.pathname.split('/').pop();
    if(table==='organization_staff_directory'&&failDirectory){failDirectory=false;return route.fulfill({status:503,headers,body:JSON.stringify({message:'Synthetic directory failure'})})}
    let source=table==='organization_staff_directory'?directory():(tables[table]||[]);
    if(table==='organization_staff_directory'&&invalidDirectory)source=source.map(s=>s.id===S?{...s,name_user_id:'wrong-user'}:s);
    let rows=source.filter(r=>[...url.searchParams].every(([k,v])=>['select','order','limit','offset','or','and'].includes(k)||matches(r[k],v)));
    if(url.searchParams.has('limit'))rows=rows.slice(0,Number(url.searchParams.get('limit')));
    const single=req.headers().accept?.includes('application/vnd.pgrst.object+json');
    return route.fulfill({status:200,headers:{...headers,'content-range':`0-${Math.max(0,rows.length-1)}/${rows.length}`},body:req.method()==='HEAD'?'':JSON.stringify(single?(rows[0]||null):rows)});
   }
   blocked.push(req.method()+' '+url.pathname);return route.fulfill({status:403,headers,body:JSON.stringify({message:'Test blocks all unplanned mutations'})});
  }
  blocked.push(req.method()+' '+url.origin+url.pathname);return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());if(d.type()==='confirm'&&/Excel/.test(d.message()))return d.accept();return d.dismiss()});
 const base=`http://127.0.0.1:${server.address().port}/ai-kiroku-app/`;
 const check=async label=>{
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert(size.scroll-size.width<=1,label+' horizontal overflow');results.push({label,viewport:viewport.width,overflow:size.scroll-size.width});
  await page.screenshot({path:path.join(artifact,`${name}-${label}.png`),fullPage:true});
 };
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#login').waitFor({state:'visible'});assert(page.url().endsWith('/home/'));
 await check('login');await page.getByLabel('メールアドレス').fill(user.email);await page.getByLabel('パスワード',{exact:true}).fill('synthetic-password');await page.locator('#loginButton').click();await page.locator('#portal').waitFor({state:'visible'});
 assert.equal(await page.locator('#tools a').count(),7);assert(await page.locator('#admin').isVisible());await check('home-admin');
 if(process.env.NEXIA_BASELINE){
 assert(process.env.NEXIA_BASELINE_ROOT,'Set NEXIA_BASELINE_ROOT to an extracted base commit');
 await context.addCookies([{name:'nexiaBaseline',value:'1',url:base}]);
 for(const [route,ready,out,button] of [['assignment/','#assignmentOutputBody tr','assignment','#assignmentOutputPrint'],['attendance/','#cloudControls','attendance','#cloudPrint'],['cashbook/','#app','cashbook','button[onclick="printCashbook()"]']]){
  await page.goto(base+route,{waitUntil:'domcontentloaded'});await page.locator(ready).first().waitFor({state:'visible'});
  if(out==='cashbook'){await page.waitForFunction(()=>document.getElementById('clientSelect')?.value==='');await page.locator('#clientSelect').selectOption(CA);await page.waitForFunction(()=>document.getElementById('currentBalance').textContent.includes('900'));}
  await page.evaluate(()=>{window.__prints=0;window.print=()=>window.__prints++});await page.locator(button).click();await page.waitForFunction(()=>window.__prints===1);await page.pdf({path:path.join(artifact,out+'.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true});
 }
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);await context.close();return {name,baselinePDFs:true};
}
for(const [label,ready] of [['今日の担当','#main'],['AI記録','#recordHistoryClient'],['担当割当','#schedule .time-row'],['申し送り','#orgLabel'],['出勤簿','#cloudControls'],['食事管理','#app'],['金銭出納帳','#app']]){
  await page.locator('#tools a').filter({has:page.getByRole('heading',{name:label,exact:true})}).click();
  try{await page.locator(ready).first().waitFor({state:'visible',timeout:20000})}catch(e){await page.screenshot({path:path.join(artifact,name+'-failure.png'),fullPage:true});console.error(JSON.stringify({label,url:page.url(),errors,blocked,requests:requests.slice(-12),body:(await page.locator('body').innerText()).slice(0,1200)}));throw e;}await page.locator('.app-nav a').filter({hasText:'NEXIAトップ'}).waitFor({state:'visible'});
  await page.waitForFunction(()=>window.__nexiaStaffNameReady===true);
  if(label==='申し送り')await page.waitForFunction(()=>document.getElementById('orgLabel').textContent.includes('管理者'));
  if(label==='金銭出納帳'){
   await page.waitForFunction(()=>document.getElementById('clientSelect')?.value==='');
   await page.locator('#clientSelect').selectOption(CA);
   await page.waitForFunction(()=>document.getElementById('currentBalance').textContent.includes('900'));
  }
  if(name==='desktop'&&label==='担当割当'){
   await page.waitForFunction(days=>document.querySelectorAll('#assignmentOutputBody tr').length===days,new Date(Number(date.slice(0,4)),Number(date.slice(5,7)),0).getDate());
   await page.evaluate(()=>{window.__prints=0;window.print=()=>window.__prints++});
   await page.locator('#assignmentOutputPrint').click();await page.waitForFunction(()=>window.__prints===1);
   await page.pdf({path:path.join(artifact,'assignment.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true});
   results.push({label:'assignment-pdf',generated:true});
  }
  if(label==='出勤簿')assert((await page.locator('#staff').innerText()).includes('確認用管理者'),'attendance uses canonical name, not placeholder');
  if(label==='担当割当')assert((await page.locator('#staffSelect').innerText()).includes('確認用管理者'),'assignment uses canonical name, not placeholder');
  if(name==='desktop'&&label==='出勤簿'){
   assert(await page.locator('#cloudControls a[href="../staff/"]').isVisible());
   const downloaded=page.waitForEvent('download');await page.locator('#export').click();const file=await downloaded.catch(async e=>{console.error(JSON.stringify({errors,dialogs,attendance:await page.evaluate(()=>({ready:cloudReady,busy:cloudBusy,dirty:cloudDirty(),notice:document.getElementById('cloudNotice').textContent}))}));throw e});await file.saveAs(path.join(artifact,'attendance.xlsx'));
   await page.evaluate(()=>{window.__prints=0;window.print=()=>window.__prints++});await page.locator('#cloudPrint').click();await page.waitForFunction(()=>window.__prints===1);
   await page.pdf({path:path.join(artifact,'attendance.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true});
   await page.emulateMedia({media:'print'});
   assert(!(await page.locator('.nexia-top-tab').isVisible()));
   const printNavigation=await page.locator('.app-nav').innerText();
   assert(!printNavigation.includes('NEXIAトップ')&&!printNavigation.includes('今日の担当')&&!printNavigation.includes('金銭出納帳'));
   assert(printNavigation.includes('今日')&&printNavigation.includes('出納帳'));
   await page.emulateMedia({media:null});
   results.push({label:'attendance-excel-pdf',generated:true});
  }
  if(name==='desktop'&&label==='金銭出納帳'){
   await page.evaluate(()=>{window.__prints=0;window.print=()=>window.__prints++});await page.getByRole('button',{name:'印刷',exact:true}).click();await page.waitForFunction(()=>window.__prints===1);
   await page.emulateMedia({media:'print'});
   assert(await page.locator('#printReport').isVisible());assert(!(await page.locator('.input-card').isVisible()));
   await page.pdf({path:path.join(artifact,'cashbook.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true});
   await page.emulateMedia({media:null});
   results.push({label:'cashbook-pdf',generated:true});
  }
  await check('feature-'+label);
  if(label==='今日の担当'){
   await page.locator('#todoList a').first().click();await page.waitForFunction(id=>window.assignmentContext?.assignmentId===id&&window.__assignmentContextGuardReady===true,AS);
   await page.locator('#backToDashboard').click();await page.locator('#main').waitFor({state:'visible'});
   results.push({label:'assignment-record-return',restored:true});
  }
  await page.getByRole('link',{name:'NEXIAトップ',exact:true}).click();await page.locator('#portal').waitFor({state:'visible'});assert(await page.locator('#admin').isVisible());
 }
 assert.equal(requests.filter(r=>r.path.endsWith('/token')).length,1,'only one password login across seven features');
 await page.locator('#organization').selectOption(B);await page.waitForFunction(id=>localStorage.getItem('activeOrganizationId')===id,B);await page.locator('#portal').waitFor({state:'visible'});assert(!(await page.locator('#admin').isVisible()));await check('home-staff');
 await page.locator('#tools a').filter({has:page.getByRole('heading',{name:'食事管理',exact:true})}).click();await page.locator('#app').waitFor({state:'visible'});assert.equal(await page.locator('#org').inputValue(),B);await page.locator('[data-tab="settings"]').click();await page.locator('#profileForm').waitFor({state:'visible'});assert(await page.locator('#profileForm input[name="food_form"]').isDisabled());assert.equal(await page.locator('#residentEditForm').count(),0);await check('meals-staff');
 await page.getByRole('link',{name:'NEXIAトップ',exact:true}).click();await page.locator('#portal').waitFor({state:'visible'});
 await page.locator('#tools a').filter({has:page.getByRole('heading',{name:'出勤簿',exact:true})}).click();await page.locator('#cloudControls').waitFor({state:'visible'});assert.equal(await page.locator('#cloudOrg').inputValue(),B);assert(!(await page.locator('#staff').isVisible()));assert(!(await page.locator('#cloudControls a[href="../staff/"]').isVisible()));assert(await page.locator('#upload').evaluate(e=>e.closest('details').hidden));
 if(name==='desktop'){const downloaded=page.waitForEvent('download');await page.locator('#export').click();await (await downloaded).saveAs(path.join(artifact,'attendance-self.xlsx'));}
 await check('attendance-staff');await page.getByRole('link',{name:'NEXIAトップ',exact:true}).click();await page.locator('#portal').waitFor({state:'visible'});
 await page.locator('#organization').selectOption(A);await page.waitForFunction(id=>localStorage.getItem('activeOrganizationId')===id,A);await page.locator('#portal').waitFor({state:'visible'});
 await page.getByRole('link',{name:'管理画面',exact:true}).click();await page.locator('#app').waitFor({state:'visible'});await check('admin');await page.getByRole('link',{name:'NEXIAトップ',exact:true}).click();await page.locator('#portal').waitFor({state:'visible'});
 // Reproduce master/member mismatch, then exercise actual staff/manage UIs.
 await page.goto(base+'staff/',{waitUntil:'domcontentloaded'});
 const own=()=>page.locator('[data-staff-id="'+S+'"] .name');
 await own().waitFor();await page.waitForFunction(()=>window.__nexiaStaffNameReady===true);
 assert((await own().innerText()).includes('確認用管理者'));assert(!(await page.locator('#list').innerText()).includes('氏名未設定'));
 await check('staff-canonical-name');
 // A failed read must not leave an old actionable list, or guess a different person.
 failDirectory=true;await page.evaluate(()=>load());assert.equal(await page.locator('#list .staff').count(),0);assert((await page.locator('#listStatus').innerText()).includes('読み込めません'));
 await page.evaluate(()=>load());await own().waitFor();
 invalidDirectory=true;await page.evaluate(()=>load());assert.equal(await page.locator('#list .staff').count(),0);assert((await page.locator('#listStatus').innerText()).includes('紐付け'));
 invalidDirectory=false;await page.evaluate(()=>load());await own().waitFor();
 const rename=async(id,name)=>{
  await page.evaluate(({id,name})=>{window.prompt=()=>name;return window.renameStaff(id)},{id,name});
 };
 failAdminRename=true;await rename(S,'管理画面で変更した氏名');assert.equal(renameWrites,0);assert((await own().innerText()).includes('確認用管理者'));
 await rename(S,'管理画面で変更した氏名');assert((await own().innerText()).includes('管理画面で変更した氏名'));assert.equal(renameWrites,1);
 assert.equal(tables.organization_members.find(m=>m.organization_id===B).staff_name,'確認用職員');
 assert.equal(tables.staff_assignments[0].assigned_staff_name,'確認用管理者','historical assignments unchanged');
 await page.reload();await own().waitFor();assert((await own().innerText()).includes('管理画面で変更した氏名'));
 const offlineId='40000000-0000-4000-8000-000000000003';await rename(offlineId,'代理入力の新氏名');assert.equal(renameWrites,2);assert((await page.locator('[data-staff-id="'+offlineId+'"] .name').innerText()).includes('代理入力の新氏名'));
 await page.goto(base+'manage/',{waitUntil:'domcontentloaded'});const managed=()=>page.locator('[data-user-id="'+U+'"] .manage-name');await managed().waitFor();assert((await managed().innerText()).includes('管理画面で変更した氏名'));
 await check('manage-canonical-name');await page.reload();await managed().waitFor();assert((await managed().innerText()).includes('管理画面で変更した氏名'));
 canonicalUpdate(A,U,'別画面で変更した氏名');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>document.querySelector('#staffList .manage-name')?.textContent.includes('別画面で変更した氏名'));
 await page.goto(base+'staff/',{waitUntil:'domcontentloaded'});await own().waitFor();assert((await own().innerText()).includes('別画面で変更した氏名'));
 results.push({label:'staff-manage-consistency-rename-reload-focus',renameWrites,readFailureCleared:true,invalidIdentityBlocked:true});
 await page.getByRole('link',{name:'NEXIAトップ',exact:true}).click();await page.locator('#portal').waitFor({state:'visible'});
 for(const width of (name==='desktop'?[1024,768,560,390,320]:[])){
  await page.setViewportSize({width,height:900});const over=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert(over<=1,'top overflow at '+width);results.push({label:'home-responsive',viewport:width,overflow:over});
 }
 // A legacy assignment URL must request the missing name, save it once and restore the URL.
 await page.setViewportSize(viewport);tables.organization_members.find(m=>m.organization_id===A).staff_name='';allowNameWrite=true;failNameSave=true;
 const deep=base+'?from=assignment&assignment='+AS+'&returnDashboard=name-check';
 await page.goto(deep,{waitUntil:'domcontentloaded'});await page.locator('#nameRegistration').waitFor({state:'visible'});assert(page.url().includes('/home/?next='));assert(!(await page.locator('#businessMenu').isVisible()));assert(!(await page.locator('#admin').isVisible()));
 await check('required-name');await page.locator('#staffName').fill('　 ');await page.locator('#saveStaffName').click();assert.equal(nameWriteAttempts,0);
 await page.locator('#staffName').fill('登録した確認職員');await page.locator('#saveStaffName').click();await page.waitForFunction(()=>document.getElementById('nameStatus').textContent.includes('登録できません'));assert(!(await page.locator('#businessMenu').isVisible()));assert.equal(await page.locator('#staffName').inputValue(),'登録した確認職員');
 await page.locator('#saveStaffName').click();await page.waitForURL(url=>url.pathname==='/ai-kiroku-app/'&&url.searchParams.get('assignment')===AS);await page.waitForFunction(id=>window.__nexiaStaffNameReady===true&&window.assignmentContext?.assignmentId===id,AS);assert.equal(new URL(page.url()).searchParams.get('returnDashboard'),'name-check');assert.equal(nameWrites,1);
 await page.getByRole('link',{name:'NEXIAトップ',exact:true}).click();await page.locator('#businessMenu').waitFor({state:'visible'});await page.reload();await page.locator('#businessMenu').waitFor({state:'visible'});assert(!(await page.locator('#nameRegistration').isVisible()));
 tables.organization_members.find(m=>m.organization_id===B).staff_name='氏名未設定';await page.locator('#organization').selectOption(B);await page.locator('#nameRegistration').waitFor({state:'visible'});assert((await page.locator('#nameFacility').innerText()).includes('確認用施設B'));
 await page.locator('#staffName').fill('施設Bの確認職員');await page.locator('#saveStaffName').click();await page.locator('#businessMenu').waitFor({state:'visible'});assert(!(await page.locator('#admin').isVisible()));assert.equal(tables.organization_members.find(m=>m.organization_id===A).staff_name,'登録した確認職員');assert.equal(tables.organization_members.find(m=>m.organization_id===A).role,'admin');assert.equal(nameWrites,2);
 results.push({label:'required-name-save-retry-and-deep-link-return',nameWrites,nameWriteAttempts,restored:true});
 await page.getByRole('button',{name:'ログアウト',exact:true}).click();await page.locator('#login').waitFor({state:'visible'});assert(!(await page.locator('#portal').isVisible()));
 assert.deepEqual(blocked,[],'unexpected external calls or writes');assert.deepEqual(errors,[],'uncaught script errors');
 // Reauthentication must read the persisted name in BOTH administration pages.
 await page.getByLabel('メールアドレス').fill(user.email);await page.getByLabel('パスワード',{exact:true}).fill('synthetic-password');await page.locator('#loginButton').click();await page.locator('#portal').waitFor({state:'visible'});
 await page.locator('#organization').selectOption(A);await page.waitForFunction(id=>localStorage.getItem('activeOrganizationId')===id,A);
 await page.goto(base+'staff/',{waitUntil:'domcontentloaded'});await own().waitFor();assert((await own().innerText()).includes('登録した確認職員'));
 await page.goto(base+'manage/',{waitUntil:'domcontentloaded'});await managed().waitFor();assert((await managed().innerText()).includes('登録した確認職員'));
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);assert.equal(requests.filter(r=>r.path.endsWith('/token')).length,2);
 results.push({label:'staff-manage-after-relogin',persisted:true});
 const report={name,results,passwordLogins:requests.filter(r=>r.path.endsWith('/token')).length,requests:requests.length,unplannedRequests:blocked,scriptErrors:errors,dialogs};
 fs.writeFileSync(path.join(artifact,`${name}.json`),JSON.stringify(report,null,2));await context.close();return report;
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.NEXIA_CHROMIUM||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)});
 try{for(const [v,name] of [[{width:1440,height:1000},'desktop'],...(process.env.NEXIA_BASELINE?[]:[[{width:390,height:844},'mobile']])])console.log(JSON.stringify(await scenario(browser,v,name)));}
 finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);server.close();process.exit(1)});
