// Browser -> real supabase-js -> intercepted REST -> isolated Postgres RLS/RPCs.
// Synthetic identities only; any unexpected external request is aborted.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright'),{PGlite}=require(process.env.PGLITE_PATH||'@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),assets=process.env.NEXIA_BROWSER_ASSETS||'/workspace/work/handoff-room-assets',out=process.env.MEAL_EXTRA_OUTPUT||path.join(assets,'meal-extra-results');fs.mkdirSync(out,{recursive:true});
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,[ORG,ADMIN,STAFF,EDITOR,CLIENT,SINGLE]=[1,11,12,13,21,22].map(id);
const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://local').pathname.replace(/^\/ai-kiroku-app\//,''));try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('content-type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
async function scenario(browser,width){const pg=new PGlite(),errors=[],unexpected=[],contexts=[];let chain=Promise.resolve();
 const atomic=fn=>{const p=chain.then(fn);chain=p.catch(()=>{});return p;};
 try{
 await pg.exec("set time zone 'Asia/Tokyo'");
 await pg.exec(fs.readFileSync(path.join(root,'tests/fixtures/facility_editor_schema.sql'),'utf8'));
 await pg.exec(fs.readFileSync(path.join(root,'tests/fixtures/scoped_permissions_schema.sql'),'utf8'));
 await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261115235721_facility_editor_permissions.sql'),'utf8'));
 await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[ADMIN]);
 for(const uid of [ADMIN,STAFF,EDITOR])await pg.query('insert into auth.users values($1,$2)',[uid,uid+'@example.invalid']);
 await pg.query('insert into public.organizations(id,name,join_code,created_by) values($1,\'合成検証施設\',\'SYNTHETIC\',$2)',[ORG,ADMIN]);
 for(const [uid,role]of [[ADMIN,'admin'],[STAFF,'staff'],[EDITOR,'staff']])await pg.query('insert into public.organization_members(organization_id,user_id,role,staff_name) values($1,$2,$3,\'合成職員\')',[ORG,uid,role]);
 await pg.query('insert into public.clients(id,organization_id,code,room_number,display_name) values($1,$2,\'test\',\'101\',\'合成利用者\')',[CLIENT,ORG]);
 await pg.query('insert into public.meal_profiles(organization_id,client_id,start_date,rice_morning,rice_lunch,rice_evening) values($1,$2,$3,250,249,250)',[ORG,CLIENT,date]);
 await pg.query("insert into public.meal_entries(organization_id,client_id,meal_date,meal,status) values($1,$2,(date_trunc('month',current_date)-interval '1 month')::date,'morning','served')",[ORG,CLIENT]);
 await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261119123222_meal_extra_charges.sql'),'utf8'));
 await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261123110200_meal_rice_confirmation_only_when_charged.sql'),'utf8'));
 await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261124032400_meal_rice_charge_on_served.sql'),'utf8'));
 await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261119134048_record_facts_profiles.sql'),'utf8'));
 await pg.query('select public.set_facility_editor($1,$2,true,false)',[ORG,EDITOR]);
 await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261120051058_safe_granular_facility_permissions.sql'),'utf8'));
 await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261124073400_meal_single_items.sql'),'utf8'));
 async function pageFor(uid){
  const ctx=await browser.newContext({viewport:{width,height:950},isMobile:width<600,hasTouch:width<600,locale:'ja-JP',timezoneId:'Asia/Tokyo',acceptDownloads:true});contexts.push(ctx);
  const user={id:uid,email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}},exp=Math.floor(Date.now()/1000)+3600,token='e30.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',aud:'authenticated',exp})).toString('base64url')+'.synthetic';
  await ctx.addInitScript(({user,token,exp,ORG})=>{localStorage.setItem('sb-pagamoaxhqszojxrpxyu-auth-token',JSON.stringify({access_token:token,expires_at:exp,refresh_token:'synthetic',token_type:'bearer',user}));localStorage.setItem('activeOrganizationId',ORG);},{user,token,exp,ORG});
  await ctx.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url()),method=req.method();
   if(u.hostname==='127.0.0.1')return route.continue();
   if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('@supabase/supabase-js@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(assets,'supabase-2.57.4.js'))});
   if(u.hostname!=='pagamoaxhqszojxrpxyu.supabase.co'){unexpected.push(u.origin+u.pathname);return route.abort();}
   const headers={'access-control-allow-origin':'*','content-type':'application/json'};
   if(method==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS'}});
   if(u.pathname.endsWith('/user'))return route.fulfill({headers,body:JSON.stringify(user)});
   const result=await atomic(async()=>{
    await pg.exec('reset role;set role authenticated');await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
    try{
     if(u.pathname.includes('/rpc/')){const fn=u.pathname.split('/').at(-1),p=JSON.parse(req.postData()||'{}');if(!['save_meal_extra_price','save_meal_extra','meal_bill_action','meal_set_status','meal_amend_serving'].includes(fn))throw Error('Unexpected RPC '+fn);
      const names=Object.keys(p);const {rows}=await pg.query('select public.'+fn+'('+names.map((k,i)=>k+'=> $'+(i+1)).join(',')+') result',Object.values(p).map(v=>v&&typeof v==='object'?JSON.stringify(v):v));return {data:rows[0].result};}
     const table=u.pathname.split('/').at(-1);if(!['organizations','organization_members','organization_facility_editors','organization_feature_permissions','clients','meal_profiles','meal_prices','meal_entries','meal_extra_prices','meal_entry_extras','meal_bill_versions'].includes(table))throw Error('Unexpected table '+table);
     const params=[],where=[];for(const [k,v]of u.searchParams){if(['select','order','limit','offset'].includes(k))continue;if(!/^\w+$/.test(k))throw Error('bad column');const dot=v.indexOf('.'),op=v.slice(0,dot),value=v.slice(dot+1);
      if(op==='in'){const ps=value.slice(1,-1).split(',');where.push(k+' in ('+ps.map(p=>{params.push(p);return '$'+params.length;}).join(',')+')');}else{const cmp={eq:'=',gte:'>=',lte:'<=',is:'is'}[op];if(!cmp)throw Error('Unexpected filter '+op);params.push(value);where.push(k+cmp+'$'+params.length);}}
     let sql='select * from public.'+table;
     if(method==='PATCH'){const p=JSON.parse(req.postData());sql='update public.'+table+' set '+Object.keys(p).map(k=>{params.push(p[k]);return k+'=$'+params.length;}).join(',');}
     if(method==='POST'){const p=JSON.parse(req.postData());sql='insert into public.'+table+'('+Object.keys(p).join(',')+') values('+Object.values(p).map(v=>{params.push(v);return '$'+params.length;}).join(',')+')';}
     if(where.length)sql+=' where '+where.join(' and ');
     if(method==='GET'){const order=u.searchParams.get('order');if(order&&/^[\w.,]+$/.test(order))sql+=' order by '+order.replaceAll('.asc',' asc').replaceAll('.desc',' desc');sql+=' limit 500';}else sql+=' returning *';
     const {rows}=await pg.query(sql,params);return {data:req.headers().accept?.includes('application/vnd.pgrst.object+json')?rows[0]:rows};
    }catch(e){return {error:{message:e.message,code:e.code||'TEST_FAILURE'}};}
   });return route.fulfill({status:result.error?400:200,headers,body:JSON.stringify(result.error||result.data,(k,v)=>['meal_date','effective_date','start_date','end_date','month'].includes(k)&&typeof v==='string'?v.slice(0,10):v)});
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{if(d.type()==='confirm'&&page.cancelNextConfirm){page.cancelNextConfirm=false;return d.dismiss();}return d.type()==='prompt'?d.accept('合成検証の確認'):d.type()==='confirm'?d.accept():d.dismiss();});
  await page.goto(`http://127.0.0.1:${server.address().port}/ai-kiroku-app/meals/`);await page.locator('#app').waitFor({state:'visible'});await page.waitForFunction(()=>window.__nexiaStaffNameReady===true);return page;
 }
 const admin=await pageFor(ADMIN);await admin.locator('[data-tab=settings]').click();const f=admin.locator('#extraPriceForm');
 await f.locator('[name=enabled]').check();await f.locator('[name=free_limit]').fill('200');await f.locator('[name=rice_refill_price]').fill('50');await f.locator('[name=soup_refill_price]').fill('30');
 async function band(from,to,amount){await admin.locator('#addExtraBand').click();const row=admin.locator('#extraBands tr').last();await row.locator('[data-band=from]').fill(String(from));if(to!==null)await row.locator('[data-band=to]').fill(String(to));await row.locator('[data-band=amount]').fill(String(amount));}
 await band(250,299,50);await band(300,null,100);await f.locator('[type=submit]').click();await admin.waitForFunction(()=>document.getElementById('notice').textContent.includes('201〜249g'));assert.equal((await pg.query('select count(*)::int n from public.meal_extra_prices')).rows[0].n,0);await f.screenshot({path:path.join(out,width+'-gap.png')});
 // Explicit synthetic gap resolution for UI validation, not a production recommendation.
 await band(201,249,0);await f.locator('[type=submit]').click();await admin.waitForFunction(()=>document.getElementById('notice').textContent.includes('新しい履歴'));assert((await admin.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1,'settings page fits viewport');await admin.locator('#extraPriceForm').screenshot({path:path.join(out,width+'-settings.png')});
 const staff=await pageFor(STAFF);await staff.locator('[data-status]').first().selectOption('served');await staff.waitForFunction(()=>document.getElementById('notice').textContent.includes('提供済みを保存'));
 assert.equal(await staff.getByRole('dialog').count(),0,'a paid portion saves as served without opening a dialog');
 assert.equal(await staff.locator('[data-status]').first().inputValue(),'served');
 assert.equal(await staff.locator('.extra-control').getAttribute('open'),null,'rice details stay collapsed');
 const readExtra=meal=>atomic(async()=>{
  await pg.exec('reset role');
  return (await pg.query('select actual_rice,state,rice_amount,rice_refill_amount,soup_refill_amount from public.meal_entry_extras where client_id=$1 and meal=$2 and meal_date=$3',[CLIENT,meal,date])).rows[0];
 });
 assert.deepEqual(await readExtra('morning'),{actual_rice:null,state:'ready',rice_amount:50,rice_refill_amount:0,soup_refill_amount:0});
 assert((await staff.locator('#notice').innerText()).includes('白米の追加料金 50円を計上'));
 await staff.locator('[data-tab=bill]').click();
 assert((await staff.locator('.tablewrap').first().innerText()).includes('380円'),'monthly bill includes the charge without an actual-rice edit');
 await staff.locator('[data-tab=today]').click();
 await staff.locator('.extra-control summary').click();
 let form=staff.locator('[data-extra]');
 assert((await form.locator('[data-preview]').innerText()).includes('設定量 250g'));
 await form.locator('[data-confirm-rice]').click();
 await staff.waitForFunction(()=>document.getElementById('notice').textContent.includes('追加料金 50円を集計に反映'));
 assert.deepEqual(await readExtra('morning'),{actual_rice:250,state:'ready',rice_amount:50,rice_refill_amount:0,soup_refill_amount:0});
 for(let i=0;i<2;i++){await form.locator('[data-step=rice][data-delta="1"]').click();await form.locator('[data-step=soup][data-delta="1"]').click();}
 staff.cancelNextConfirm=true;await staff.locator('button[data-meal=lunch]').click();assert.equal(await form.locator('[name=rice]').inputValue(),'2','cancelled meal switch preserves unsaved counts');assert.equal(await staff.evaluate(()=>S.meal),'morning');
 assert((await form.locator('[data-preview]').innerText()).includes('210円'));await form.locator('[type=submit]').click();await staff.waitForFunction(()=>document.getElementById('notice').textContent.includes('追加料金 210円を集計に反映'));
 await staff.reload();await staff.locator('#app').waitFor({state:'visible'});await staff.waitForFunction(()=>window.__nexiaStaffNameReady===true);await staff.locator('.extra-control summary').click();form=staff.locator('[data-extra]');assert.equal(await form.locator('[name=rice]').inputValue(),'2');assert.equal(await form.locator('[name=grams]').inputValue(),'250');assert((await staff.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1,'serving page fits viewport');assert((await form.evaluate(e=>e.scrollWidth-e.clientWidth))<=1,'counter form fits viewport');await staff.locator('.today-table').screenshot({path:path.join(out,width+'-serving.png')});
 const second=await pageFor(STAFF);assert((await second.locator('.extra-control summary').innerText()).includes('210円'));await second.close();
 await staff.locator('[data-tab=bill]').click();assert((await staff.locator('.tablewrap').first().innerText()).includes('540円'));assert((await staff.locator('.tablewrap').first().innerText()).includes('210円'));assert.equal(await staff.locator('#billAction').count(),0);
 const dlPromise=staff.waitForEvent('download');await staff.locator('#csv').click();const dl=await dlPromise;await dl.saveAs(path.join(out,width+'.csv'));const csv=fs.readFileSync(path.join(out,width+'.csv'),'utf8');assert(csv.includes('白米おかわり（円）')&&csv.includes('540')&&csv.includes('210'));
 await staff.locator('#printBill').click();await staff.pdf({path:path.join(out,width+'.pdf'),format:'A4',landscape:true});await staff.screenshot({path:path.join(out,width+'-bill.png'),fullPage:true});
 await staff.locator('[data-tab=month]').click();
 const lunch=staff.locator(`[data-status][data-date="${date}"][data-meal="lunch"]`);
 await lunch.selectOption('served');await staff.waitForFunction(()=>document.getElementById('notice').textContent.includes('昼食：提供済みを保存'));
 assert.equal(await staff.getByRole('dialog').count(),0,'a zero-yen band above the free limit also skips confirmation');
 assert.deepEqual(await readExtra('lunch'),{actual_rice:null,state:'ready',rice_amount:0,rice_refill_amount:0,soup_refill_amount:0});
 await staff.locator(`[data-confirm-meal="lunch"][data-date="${date}"]`).click();
 const changedDialog=staff.getByRole('dialog',{name:'白米量・おかわりを入力'});
 await changedDialog.locator('[name=grams]').fill('300');
 await changedDialog.getByRole('button',{name:'白米量・追加料金を確定'}).click();
 await changedDialog.waitFor({state:'hidden'});
 assert.deepEqual(await readExtra('lunch'),{actual_rice:300,state:'ready',rice_amount:100,rice_refill_amount:0,soup_refill_amount:0});
 const evening=staff.locator(`[data-status][data-date="${date}"][data-meal="evening"]`);
 await evening.selectOption('served');await staff.waitForFunction(()=>document.getElementById('notice').textContent.includes('夕食：提供済みを保存'));
 assert.equal(await staff.getByRole('dialog').count(),0,'paid portions also save immediately from the calendar');
 assert.equal(await evening.inputValue(),'served');
 assert.deepEqual(await readExtra('evening'),{actual_rice:null,state:'ready',rice_amount:50,rice_refill_amount:0,soup_refill_amount:0});
 await staff.locator(`[data-confirm-meal="evening"][data-date="${date}"]`).click();
 await changedDialog.locator('[name=grams]').fill('200');
 assert((await changedDialog.locator('[data-preview]').innerText()).includes('＝ 0円'));
 await changedDialog.getByRole('button',{name:'白米量・追加料金を確定'}).click();
 await changedDialog.waitFor({state:'hidden'});
 assert.deepEqual(await readExtra('evening'),{actual_rice:200,state:'ready',rice_amount:0,rice_refill_amount:0,soup_refill_amount:0});
 await staff.locator('[data-tab=settings]').click();assert.equal(await staff.locator('#extraPriceForm').count(),0);
 const editor=await pageFor(EDITOR);await editor.locator('[data-tab=settings]').click();assert.equal(await editor.locator('#extraPriceForm').count(),0);
 const denied=await editor.evaluate(async({ORG,date})=>{const {error}=await db.rpc('save_meal_extra_price',{p_org:ORG,p_expected:null,p_date:date,p_enabled:true,p_free:200,p_bands:[],p_rice:1,p_soup:1});return error?.message;},{ORG,date});assert.equal(denied,'facility_edit_required');
 // Close a historical month, reopen with a reason, then display its original frozen version.
 const past=(await pg.query("select (date_trunc('month',current_date)-interval '1 month')::date::text d")).rows[0].d;
 await admin.locator('#month').fill(past.slice(0,7));await admin.locator('[data-tab=bill]').click();
 await admin.locator('#billAction').click();await admin.waitForFunction(()=>document.getElementById('notice').textContent.includes('確定状態を履歴'));
 assert((await admin.locator('#billAction').innerText()).includes('確定を解除'));
 await admin.locator('#billAction').click();await admin.waitForFunction(()=>document.getElementById('billAction').textContent.includes('請求を確定'));
 const oldVersion=(await pg.query('select id from public.meal_bill_versions where version=1')).rows[0].id;
 await admin.locator('#billVersion').selectOption(oldVersion);assert((await admin.locator('.tablewrap').first().innerText()).includes('330円'));
 await admin.locator('#printBill').click();assert((await admin.locator('#print').innerText()).includes('確定 第1版'));
 // Save an ordinary daily preference and serve it with no second confirmation.
 await atomic(async()=>{
  await pg.exec('reset role');
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[ADMIN]);
  await pg.query("insert into public.clients(id,organization_id,code,room_number,display_name) values($1,$2,'single','102','単品の架空利用者')",[SINGLE,ORG]);
 });
 await admin.locator('#month').fill(date.slice(0,7));
 await admin.waitForFunction(month=>S.month===month&&S.ready,date.slice(0,7));
 await admin.locator('[data-tab=settings]').click();
 await admin.locator('#selected').selectOption(SINGLE);
 const profileForm=admin.locator('#profileForm');
 await profileForm.locator('[name=morning_kind]').selectOption('miso_soup');
 await profileForm.locator('[name=lunch_kind]').selectOption('rice_ball');
 await profileForm.locator('[name=lunch_quantity]').fill('2');
 await profileForm.locator('[type=submit]').click();
 await admin.waitForFunction(()=>document.getElementById('notice').textContent.includes('食事設定を保存'));
 const singlePage=await pageFor(STAFF);
 await singlePage.locator('[data-tab=month]').click();
 await singlePage.locator('#selected').selectOption(SINGLE);
 const morning=singlePage.locator(`[data-status][data-meal="morning"][data-date="${date}"]`).locator('..');
 assert((await morning.innerText()).includes('みそ汁のみ・1杯'));
 if(Number(date.slice(-2))>1){
  const beforeStart=singlePage.locator('[data-status][data-meal="morning"]').first().locator('..');
  assert(!(await beforeStart.innerText()).includes('みそ汁のみ'),'single items are hidden on days without a scheduled meal');
 }
 await singlePage.locator('[data-tab=today]').click();
 const status=singlePage.locator(`[data-status][data-client="${SINGLE}"]`);
 assert((await singlePage.locator('.today-table').innerText()).includes('みそ汁のみ・1杯'));
 await status.selectOption('served');
 await singlePage.waitForFunction(()=>document.getElementById('notice').textContent.includes('50円を計上'));
 assert.equal(await singlePage.getByRole('dialog').count(),0);
 await singlePage.locator('button[data-meal=lunch]').click();
 assert((await singlePage.locator('.today-table').innerText()).includes('おにぎりのみ・2個'));
 await status.selectOption('served');
 await singlePage.waitForFunction(()=>document.getElementById('notice').textContent.includes('200円を計上'));
 const singleRead=async()=>atomic(async()=>{
  await pg.exec('reset role');
  return (await pg.query("select serving_kind,serving_quantity,unit_price from public.meal_entries where client_id=$1 and meal_date=$2 order by meal desc",[SINGLE,date])).rows;
 });
 const billed=await singleRead();
 assert.deepEqual(billed.map(r=>r.unit_price),[50,200]);
 const pricing=admin.locator('#priceForm');
 await pricing.locator('[name=miso_soup]').fill('70');
 await pricing.locator('[name=rice_ball]').fill('120');
 await pricing.locator('[type=submit]').click();
 await admin.waitForFunction(()=>document.getElementById('notice').textContent.includes('料金を登録しました'));
 assert.deepEqual(await singleRead(),billed,'new rates preserve saved items and prices');
 const edit=singlePage.locator(`[data-edit-serving="lunch"][data-client="${SINGLE}"]`);
 await edit.click();
 const servingDialog=singlePage.getByRole('dialog',{name:'提供内容を変更'});
 await servingDialog.locator('[name=quantity]').fill('3');
 await servingDialog.getByRole('button',{name:'保存',exact:true}).click();
 await servingDialog.waitFor({state:'hidden'});
 await singlePage.waitForFunction(()=>document.getElementById('notice').textContent.includes('おにぎりのみ・3個'));
 assert.deepEqual((await singleRead()).map(r=>r.unit_price),[50,300]);
 await singlePage.locator('[data-tab=bill]').click();
 await singlePage.locator('#billPerson').selectOption(SINGLE);
 assert((await singlePage.locator('.tablewrap').first().innerText()).includes('350円'),'bill includes singles at saved prices');
 assert((await singlePage.locator('.tablewrap').last().innerText()).includes('おにぎりのみ・3個'));
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log('PASS browser + real isolated DB',width,'PC/mobile pricing, gap detection, serving, counts, reload, second device, billing, CSV/PDF, staff/editor API denial');
 fs.writeFileSync(path.join(out,width+'.json'),JSON.stringify({width,errors,unexpected,realIsolatedDatabase:true,passed:true},null,2));
 }catch(e){for(const c of contexts)for(const p of c.pages()){console.error('FAILPAGE',await p.locator('body').innerText());await p.screenshot({path:path.join(out,width+'-failure.png'),fullPage:true});}throw e;}finally{await Promise.all(contexts.map(c=>c.close()));await pg.close();}
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.NEXIA_CHROMIUM||'/usr/bin/chromium'});try{for(const width of [1440,390])await scenario(browser,width);}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
