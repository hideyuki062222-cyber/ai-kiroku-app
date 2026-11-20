// Actual pinned HTML wrapper + real SDK + isolated Postgres. No production rows/accounts.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright'),{PGlite}=require(process.env.PGLITE_PATH||'@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),assets=process.env.NEXIA_BROWSER_ASSETS||'/workspace/work/handoff-room-assets',baselineRoot=process.env.RECORD_QUALITY_BASELINE||path.join(assets,'record-quality-before'),out=process.env.RECORD_QUALITY_OUTPUT||path.join(assets,'record-quality-results');fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(assets,'manifest.json'))).sort((a,b)=>b.path.length-a.path.length);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,[ORG,ADMIN,STAFF,EDITOR,CLIENT,CLIENT2,ASSIGN,SLOT,OLD]=[1,11,12,13,21,22,31,41,51].map(id);
const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const server=http.createServer((req,res)=>{let file=path.join(root,new URL(req.url,'http://local').pathname.replace(/^\/ai-kiroku-app\//,''));try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('content-type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
async function scenario(browser,width){const pg=new PGlite(),errors=[],unexpected=[],contexts=[],variantCalls=[];let chain=Promise.resolve();
 const atomic=fn=>{const p=chain.then(fn);chain=p.catch(()=>{});return p;};
 try{
 await pg.exec(fs.readFileSync(path.join(root,'tests/fixtures/facility_editor_schema.sql'),'utf8'));
 await pg.exec(fs.readFileSync(path.join(root,'tests/fixtures/scoped_permissions_schema.sql'),'utf8'));
 for(const f of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f>='20261115235721'&&f<'20261119144626'))await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8'));
 await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[ADMIN]);
 for(const uid of [ADMIN,STAFF,EDITOR])await pg.query('insert into auth.users values($1,$2)',[uid,uid+'@example.invalid']);
 await pg.query('insert into public.organizations(id,name,join_code,created_by) values($1,\'架空検証施設\',\'SYNTHETIC\',$2)',[ORG,ADMIN]);
 for(const [uid,role]of [[ADMIN,'admin'],[STAFF,'staff'],[EDITOR,'staff']])await pg.query('insert into public.organization_members(organization_id,user_id,role,staff_name) values($1,$2,$3,\'架空職員\')',[ORG,uid,role]);
 for(const [c,code,room]of [[CLIENT,'resident-101','101'],[CLIENT2,'resident-102','102']])await pg.query("insert into public.clients(id,organization_id,code,room_number,display_name,usual,communication,support_method,caution) values($1,$2,$3,$4,'架空利用者'||$4,'普段は穏やか','短い言葉で声かけする','洗身する','転倒に注意')",[c,ORG,code,room]);
 await pg.query("insert into public.staff_assignments(id,organization_id,client_id,service_date,service_time,assigned_user_id,assigned_staff_name,memo,created_by,updated_by) values($1,$2,$3,$4,'09:00',$5,'架空職員','予定：洗身を介助する',$6,$6)",[ASSIGN,ORG,CLIENT,date,STAFF,ADMIN]);
 await pg.query("insert into public.client_service_slots(id,organization_id,client_id,service_time,service_contents) values($1,$2,$3,'09:00','[\"服薬介助・確認\"]')",[SLOT,ORG,CLIENT]);
 await pg.query("insert into public.care_records(id,organization_id,client_id,created_by,visit_note,care_note) values($1,$2,$3,$4,'保持する過去の観察','保持する過去の支援')",[OLD,ORG,CLIENT,ADMIN]);
 await pg.query('select public.set_facility_editor($1,$2,true,false)',[ORG,EDITOR]);
 await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261120051058_safe_granular_facility_permissions.sql'),'utf8'));
 async function pageFor(uid,baseline=false,assignment=true){
  const ctx=await browser.newContext({viewport:{width,height:950},isMobile:width<600,hasTouch:width<600,locale:'ja-JP',timezoneId:'Asia/Tokyo',acceptDownloads:true});contexts.push(ctx);
  const user={id:uid,email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}},exp=Math.floor(Date.now()/1000)+3600,token='e30.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',aud:'authenticated',exp})).toString('base64url')+'.synthetic';
  await ctx.addInitScript(({user,token,exp,ORG})=>{localStorage.setItem('sb-pagamoaxhqszojxrpxyu-auth-token',JSON.stringify({access_token:token,expires_at:exp,refresh_token:'synthetic',token_type:'bearer',user}));localStorage.setItem('activeOrganizationId',ORG);},{user,token,exp,ORG});
  await ctx.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url()),method=req.method();
   if(u.hostname==='127.0.0.1'){
    if(!baseline)return route.continue();let file=path.join(baselineRoot,u.pathname.replace(/^\/ai-kiroku-app\//,''));if(!fs.existsSync(file))return route.continue();if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');return route.fulfill({contentType:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file)});
   }
   if(['raw.githubusercontent.com','cdn.jsdelivr.net'].includes(u.hostname)&&!u.pathname.includes('@supabase/')){const m=manifest.find(m=>u.pathname.endsWith('/'+m.path));if(m)return route.fulfill({contentType:'text/html',body:fs.readFileSync(m.pinned)});}
   if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('@supabase/supabase-js@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(assets,u.pathname.includes('@2.57.4/')?'supabase-2.57.4.js':'supabase-v2.js'))});
   if(u.hostname!=='pagamoaxhqszojxrpxyu.supabase.co'){unexpected.push(u.origin+u.pathname);return route.abort();}
   const headers={'access-control-allow-origin':'*','content-type':'application/json'};
   if(method==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS'}});
   if(u.pathname.endsWith('/user'))return route.fulfill({headers,body:JSON.stringify(user)});
   const result=await atomic(async()=>{
    await pg.exec('reset role;set role authenticated');await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
    try{
     if(u.pathname.includes('/rpc/')){const fn=u.pathname.split('/').at(-1),p=JSON.parse(req.postData()||'{}');if(fn==='next_variant_seed'){variantCalls.push({baseline});return {data:0};}if(!['save_record_profile','list_organization_staff'].includes(fn))throw Error('Unexpected RPC '+fn);
      const names=Object.keys(p);const {rows}=await pg.query('select public.'+fn+'('+names.map((k,i)=>k+'=> $'+(i+1)).join(',')+') result',Object.values(p).map(v=>v&&typeof v==='object'?JSON.stringify(v):v));return {data:rows[0].result};}
     const table=u.pathname.split('/').at(-1);if(!['organizations','organization_members','organization_facility_editors','organization_feature_permissions','organization_permission_sets','care_record_amendments','clients','client_record_profiles','staff_assignments','client_service_slots','care_records'].includes(table))throw Error('Unexpected table '+table);
     const params=[],where=[];for(const [k,v]of u.searchParams){if(['select','order','limit','offset'].includes(k))continue;if(!/^\w+$/.test(k))throw Error('bad column');const dot=v.indexOf('.'),op=v.slice(0,dot),value=v.slice(dot+1);
      if(op==='not'&&value==='is.null'){where.push(k+' is not null');continue;}if(op==='in'){const ps=value.slice(1,-1).split(',');where.push(k+' in ('+ps.map(p=>{params.push(p);return '$'+params.length;}).join(',')+')');}else{const cmp={eq:'=',gte:'>=',lte:'<=',lt:'<',is:'is'}[op];if(!cmp)throw Error('Unexpected filter '+op);params.push(value);where.push(k+cmp+'$'+params.length);}}
     let sql='select * from public.'+table;
     if(method==='PATCH'){const p=JSON.parse(req.postData());sql='update public.'+table+' set '+Object.keys(p).map(k=>{params.push(p[k]);return k+'=$'+params.length;}).join(',');}
     if(method==='POST'){const p=JSON.parse(req.postData());sql='insert into public.'+table+'('+Object.keys(p).join(',')+') values('+Object.values(p).map(v=>{params.push(v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v);return '$'+params.length;}).join(',')+')';}
     if(where.length)sql+=' where '+where.join(' and ');
     if(method==='GET'||method==='HEAD'){const order=u.searchParams.get('order');if(order&&/^[\w.,]+$/.test(order))sql+=' order by '+order.replaceAll('.asc',' asc').replaceAll('.desc',' desc');sql+=' limit 500';}else sql+=' returning *';
     const {rows}=await pg.query(sql,params);return {data:req.headers().accept?.includes('application/vnd.pgrst.object+json')?rows[0]:rows,count:rows.length};
    }catch(e){return {error:{message:e.message,code:e.code||'TEST_FAILURE'}};}
   });return route.fulfill({status:result.error?400:200,headers:{...headers,'content-range':'0-0/'+(result.count||0)},body:method==='HEAD'?'':JSON.stringify(result.error||result.data,(k,v)=>['meal_date','effective_date','start_date','end_date','month','service_date'].includes(k)&&typeof v==='string'?v.slice(0,10):v)});
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{if(d.type()==='confirm'&&page.cancelNextConfirm){page.cancelNextConfirm=false;return d.dismiss();}return d.type()==='beforeunload'?d.accept():d.type()==='prompt'?d.accept('合成検証の確認'):d.type()==='confirm'?d.accept():d.dismiss();});
  page.setDefaultTimeout(12000);await page.goto(`http://127.0.0.1:${server.address().port}/ai-kiroku-app/${assignment?'?from=assignment&assignment='+ASSIGN:'?app=record'}`);await page.locator('#recordCommitButton').waitFor();await page.waitForFunction(()=>window.__nexiaStaffNameReady===true);if(assignment)await page.waitForFunction(()=>window.__assignmentContextGuardReady===true);await page.waitForLoadState('networkidle');await page.waitForFunction(()=>window.__nexiaStaffNameReady===true);return page;
 }
 const original=(await pg.query('select to_jsonb(r) x from public.care_records r where id=$1',[OLD])).rows[0].x;
 const measurements=[];
 const shot=async(page,selector,name)=>{assert((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1,name+' viewport overflow');await page.locator(selector).screenshot({path:path.join(out,width+'-'+name+'.png')});};
 // Count pointer taps; opening and choosing a native select is estimated at two taps.
 async function medInput(page,before=false,withReaction=false){
  let taps=0;const click=async selector=>{await page.locator(selector).click();taps++;};
  if(before){await page.locator('#condition').selectOption('笑顔が見られた');taps+=2;await click('[data-fact-service] input[value="服薬の声かけを行った"]');await click('[data-fact-service] input[value="服薬したことを確認した"]');if(withReaction){await click('#factResponse >> xpath=../..//summary');await page.locator('#factResponse').selectOption('うなずいて応じた');taps+=2;}}
  else{await click('[data-preset="服薬介助・確認-0"]');if(withReaction)await click('[data-reaction][value="声かけにうなずいて応じた"]');await click('[data-visit="笑顔が見られた"]');}
  await page.getByRole('button',{name:'AIで記録作成',exact:true}).click();taps++;
  await page.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('未保存'));
  return {taps,visit:await page.locator('#visitResult').innerText(),care:await page.locator('#careResult').innerText(),inputHeight:await page.locator('#factInputCard').evaluate(e=>e.getBoundingClientRect().height)};
 }
 const old=await pageFor(STAFF,true);const oldPlain=await medInput(old,true);await shot(old,'#factInputCard','before-input');await old.locator('#factResponse').evaluate(e=>e.closest('details').open=true);await old.locator('#factResponse').selectOption('うなずいて応じた');await old.getByRole('button',{name:'AIで記録作成',exact:true}).click();await old.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('未保存'));
 const oldReaction={...oldPlain,taps:oldPlain.taps+3,care:await old.locator('#careResult').innerText()};await old.close();
 const staff=await pageFor(STAFF);assert.equal(await staff.locator('[data-action]:checked').count(),0);assert.equal(await staff.locator('[data-reaction]:checked').count(),0);assert.equal(await staff.locator('#input').inputValue(),'');
 await staff.getByRole('button',{name:'AIで記録作成',exact:true}).click();await staff.locator('#factErrors').getByText('② 当日実施した支援',{exact:false}).waitFor();
 const plain=await medInput(staff);assert(plain.inputHeight<oldPlain.inputHeight,'daily input height reduced');assert.equal(plain.taps,3);assert(plain.taps<oldPlain.taps);assert(plain.care.includes('服薬の声かけを行い、本人が薬を服用されたことを確認しました。'));assert(!plain.care.includes('副作用')&&!plain.care.includes('洗身'));
 await shot(staff,'#factInputCard','after-input');
 await staff.locator('[data-reaction][value="声かけにうなずいて応じた"]').check();await staff.getByRole('button',{name:'AIで記録作成',exact:true}).click();await staff.waitForFunction(()=>document.getElementById('careResult').textContent.includes('うなずいて応じられました'));
 const reaction={...plain,taps:4,care:await staff.locator('#careResult').innerText()};assert(reaction.taps<oldReaction.taps);await shot(staff,'#careResult','after-medication');
 // No early writes and no default confirmation from assignments.
 await atomic(async()=>{await pg.exec('reset role');assert.equal((await pg.query('select count(*)::int n from public.care_records')).rows[0].n,1);});
 await staff.locator('[data-preset="服薬介助・確認-2"]').click();await staff.getByRole('button',{name:'AIで記録作成',exact:true}).click();await staff.waitForFunction(()=>document.getElementById('careResult').textContent.includes('服用済みかは確認していません'));assert(!(await staff.locator('#careResult').innerText()).includes('服用された'));
 await staff.locator('[data-reaction][value="声かけにうなずいて応じた"]').uncheck();await staff.locator('[data-preset="服薬介助・確認-3"]').click();await staff.getByRole('button',{name:'AIで記録作成',exact:true}).click();await staff.waitForFunction(()=>document.getElementById('careResult').textContent.includes('服薬の準備を介助'));assert(!(await staff.locator('#careResult').innerText()).includes('声をかけ'));assert(!(await staff.locator('#careResult').innerText()).includes('服用された'));
 await staff.locator('[data-reaction][value="服薬を拒否した"]').check();await staff.getByRole('button',{name:'AIで記録作成',exact:true}).click();await staff.waitForFunction(()=>document.getElementById('careResult').textContent.includes('服薬を拒否されました'));assert(!(await staff.locator('#careResult').innerText()).includes('服用された'));
 await staff.locator('[data-preset="服薬介助・確認-0"]').click();await staff.getByRole('button',{name:'AIで記録作成',exact:true}).click();await staff.locator('#factErrors').getByText('② 服薬の「確認済み」',{exact:false}).waitFor();
 await staff.locator('[data-reaction][value="服薬を拒否した"]').uncheck();
 await staff.locator('[data-service-details]').evaluate(e=>e.open=true);await staff.locator('[data-self]').waitFor();assert(await staff.locator('[data-service-details]').evaluate(e=>e.open));
 // Load structured profile suggestions via the existing admin RPC, never as an event.
 const admin=await pageFor(ADMIN);await admin.locator('#profileDetails').evaluate(e=>e.open=true);await admin.waitForFunction(()=>document.getElementById('factProfileStatus').textContent.includes('以前の登録内容'));
 await admin.locator('#structuredProfile details').filter({hasText:'コミュニケーション方法'}).first().evaluate(e=>e.open=true);await admin.locator('[data-profile=communication][value="ゆっくり話す"]').check();await admin.locator('#factProfileSave').click();await admin.waitForFunction(()=>document.getElementById('factProfileStatus').textContent.includes('プロフィールを保存しました'));
 await staff.reload();await staff.waitForFunction(()=>window.__assignmentContextGuardReady===true);await staff.waitForFunction(()=>document.querySelector('.fact-methods summary')?.textContent.includes('候補あり'));
 await medInput(staff);assert(!(await staff.locator('#careResult').innerText()).includes('ゆっくり話しました'));
 await staff.locator('[data-service-details]').evaluate(e=>e.open=true);await staff.locator('.fact-methods').evaluate(e=>e.open=true);await staff.locator('[data-method][value="ゆっくり話した"]').check();await staff.getByRole('button',{name:'AIで記録作成',exact:true}).click();await staff.waitForFunction(()=>document.getElementById('careResult').textContent.includes('ゆっくり話しました'));
 // The formal-save path, editable result, exact facts and preserved old rows are unchanged.
 const generated=await staff.locator('#careResult').innerText();await staff.locator('#careResult').fill(generated+'本人から水分を希望する発言があった。');await staff.locator('#recordCommitButton').click();await staff.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('正式にクラウド保存'));
 const saved=await atomic(async()=>{await pg.exec('reset role');return (await pg.query('select * from public.care_records where assignment_id=$1',[ASSIGN])).rows;});assert.equal(saved.length,1);assert.equal(saved[0].daily_facts.composerRevision,2);assert.equal(saved[0].daily_facts.actions[0].methods[0],'ゆっくり話した');assert(saved[0].care_note.includes('水分を希望'));assert.deepEqual((await pg.query('select to_jsonb(r) x from public.care_records r where id=$1',[OLD])).rows[0].x,original);
 // New client selection clears all confirmed facts and profile-based selections.
 const standalone=await pageFor(STAFF,false,false);await standalone.locator('#user').selectOption('resident-101');await standalone.waitForLoadState('networkidle');await standalone.locator('[data-service-picker="入浴介助"]').click();await standalone.locator('[data-service-details]').evaluate(e=>e.open=true);await standalone.locator('[data-action][value="下肢の洗身を介助した"]').check();await standalone.locator('[data-self]').selectOption('上半身を洗った');await standalone.locator('[data-visit="落ち着いて過ごされていた"]').click();await standalone.getByRole('button',{name:'AIで記録作成',exact:true}).click();await standalone.waitForFunction(()=>document.getElementById('careResult').textContent.includes('上半身は本人が自分で洗われました'));assert((await standalone.locator('#careResult').innerText()).includes('下肢の洗身を介助しました'));await shot(standalone,'#careResult','bathing');
 standalone.cancelNextConfirm=true;await standalone.locator('#user').selectOption('resident-102');assert.equal(await standalone.locator('#user').inputValue(),'resident-101','cancelled client change keeps facts');await standalone.locator('#user').selectOption('resident-102');assert.equal(await standalone.locator('[data-action]:checked').count(),0);assert.equal(await standalone.locator('[data-method]:checked').count(),0);assert(!(await standalone.locator('#factReference').innerText()).includes('ゆっくり話す'));
 // Length mode changes invalidate the old preview and do not fabricate any observations.
 // A client change has already removed the previous service candidates.
 await standalone.locator('[data-service-picker="服薬介助・確認"]').click();await standalone.locator('[data-preset="服薬介助・確認-0"]').click();await standalone.locator('[data-visit="笑顔が見られた"]').click();await standalone.getByRole('button',{name:'AIで記録作成',exact:true}).click();await standalone.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('未保存'));
 await standalone.locator('#length').evaluate(e=>e.closest('details').open=true);await standalone.locator('#length').selectOption('long');await standalone.locator('#recordCommitButton').click();await standalone.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('変更されています'));await standalone.getByRole('button',{name:'AIで記録作成',exact:true}).click();await standalone.waitForFunction(()=>document.getElementById('careResult').textContent.includes('【服薬介助・確認】'));assert(!(await standalone.locator('#careResult').innerText()).includes('副作用'));await shot(standalone,'#factInputCard','long-input');
 await standalone.pdf({path:path.join(out,width+'-preview.pdf'),format:'A4'});
 await standalone.evaluate(()=>document.getElementById('user').value='resident-101');await standalone.getByRole('button',{name:'AIで記録作成',exact:true}).click();await standalone.locator('#factErrors').getByText('施設・利用者の選択が変わったため',{exact:false}).waitFor();assert.equal(await standalone.locator('[data-action]:checked').count(),0,'silent client changes cannot reuse confirmed facts');

 measurements.push({label:'服薬介助のみ・担当から',before:oldPlain,after:plain},{label:'服薬介助＋反応・担当から',before:oldReaction,after:reaction});
 assert.equal(variantCalls.filter(c=>!c.baseline).length,0);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 fs.writeFileSync(path.join(out,width+'.json'),JSON.stringify({width,measurements,passed:true,errors,unexpected,realPinnedHTML:true,isolatedPostgres:true,savedRecordCount:saved.length},null,2));console.log('PASS record quality browser',width,'tap counts, natural medication, unconfirmed/refusal, profile suggestions, explicit methods, exact formal save, independence, client switch, length guard');
 }catch(e){for(const c of contexts)for(const p of c.pages()){console.error('FAILPAGE',p.url(),(await p.locator('body').innerText()).slice(-2800));await p.screenshot({path:path.join(out,width+'-failure-'+contexts.indexOf(c)+'.png'),fullPage:true});}throw e;}finally{await Promise.all(contexts.map(c=>c.close()));await pg.close();}
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.NEXIA_CHROMIUM||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)});try{for(const width of [1440,390])await scenario(browser,width);}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
