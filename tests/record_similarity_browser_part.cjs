// Reuse the real-HTML / real SDK / isolated Postgres browser fixture.
module.exports=async function({pg,atomic,pageFor,STAFF,ADMIN,EDITOR,ORG,CLIENT,CLIENT2,id,width,out}){
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
 const page=await pageFor(STAFF,false,false),requests=[],dialogs=[];
 page.on('dialog',d=>dialogs.push(d.message()));page.on('request',req=>{const u=new URL(req.url());if(u.pathname.endsWith('/care_records')&&req.method()==='GET'&&u.searchParams.get('select')?.includes('visit_note'))requests.push(Object.fromEntries(u.searchParams));});
 await page.locator('#user').selectOption('resident-102');await page.waitForLoadState('networkidle');
 await page.locator('input[name=serviceContent][value="入浴介助"]').check();await page.locator('#condition').selectOption('笑顔が見られた');
 await page.locator('#factSupportDetails > summary').click();await page.locator('[data-preset="入浴介助-self"]').click();
 assert.equal(await page.locator('[data-self]').inputValue(),'上半身を洗った');assert.equal(await page.locator('[data-action]:checked').count(),1);assert.equal(await page.locator('[data-preset][aria-pressed=true]').count(),1);
 await page.locator('[data-preset="入浴介助-1"]').click();assert.equal(await page.locator('[data-self]').inputValue(),'上半身を洗った','changing assistance must preserve the confirmed independent action');await page.locator('[data-preset="入浴介助-self"]').click();
 const generate=async()=>{await page.getByRole('button',{name:'AIで記録作成',exact:true}).click();await page.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('未保存'));};
 await generate();assert((await page.locator('#careResult').innerText()).includes('背部の洗身を介助'));assert.equal(await page.locator('#recordSimilarityNotice').getAttribute('data-matches'),'0');
 const body=await page.locator('#careResult').innerText(),visit=await page.locator('#visitResult').innerText();
 // Same words under a different resident ID must not trigger a warning or leak history.
 await atomic(async()=>{await pg.exec('reset role');await pg.query('insert into public.care_records(id,organization_id,client_id,created_by,visit_note,care_note) values($1,$2,$3,$4,$5,$6)',[id(551),ORG,CLIENT,ADMIN,visit,body]);});
 await generate();assert.equal(await page.locator('#recordSimilarityNotice').getAttribute('data-matches'),'0');
 await page.locator('#recordCommitButton').click();await page.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('正式にクラウド保存'));
 await generate();assert.equal(await page.locator('#recordSimilarityNotice').getAttribute('data-matches'),'1');assert.equal(await page.locator('#recordCommitButton').innerText(),'当日の事実として正式保存');
 await page.locator('#recordSimilarityNotice summary').click();assert((await page.locator('#recordSimilarityNotice').innerText()).includes('文章が一致'));
 assert((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1);await page.locator('#recordSimilarityNotice').screenshot({path:path.join(out,width+'-similarity.png')});
 // Identical real facts may be saved with the same single save action, with no extra modal.
 const count=async()=>atomic(async()=>{await pg.exec('reset role');return (await pg.query('select count(*)::int n from public.care_records where client_id=$1',[CLIENT2])).rows[0].n;});
 const initial=await count(),dialogCount=dialogs.length;await page.locator('#recordCommitButton').click();await page.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('正式にクラウド保存'));assert.equal(await count(),initial+1);assert.equal(dialogs.length,dialogCount);
 // Result editing refreshes the same warning without re-entering services or adding clicks.
 await generate();await page.locator('#careResult').fill(body+'希望あり。');assert(Number(await page.locator('#recordSimilarityNotice').getAttribute('data-matches'))>0);await page.locator('#recordCommitButton').click();await page.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('正式にクラウド保存'));
 const after=await count();
 // A history read failure must never masquerade as "no similar record" or save data.
 const failHistory=route=>route.request().method()==='GET'&&new URL(route.request().url()).searchParams.get('select')?.includes('visit_note')?route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'synthetic read error'})}):route.fallback();
 await page.route('**/rest/v1/care_records?*',failHistory);await page.getByRole('button',{name:'AIで記録作成',exact:true}).click();await page.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('比較ができていません'));assert(await page.locator('#recordCommitButton').isDisabled());assert.equal(await count(),after);await page.unroute('**/rest/v1/care_records?*',failHistory);
 // Discard stale results if input changes while history is loading.
 await page.evaluate(()=>{const s=window.NexiaRecordSimilarity;s.__load=s.load;s.load=async(...args)=>{const r=await s.__load(...args);document.getElementById('condition').value='不安そうな様子が見られた';return r;};});
 await page.getByRole('button',{name:'AIで記録作成',exact:true}).click();await page.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('比較中に'));assert(await page.locator('#recordCommitButton').isDisabled());assert.equal(await count(),after);await page.evaluate(()=>window.NexiaRecordSimilarity.load=window.NexiaRecordSimilarity.__load);
 await generate();
 // RLS remains enforced when the same module is called directly with a forged facility ID.
 const otherOrg=id(901),otherClient=id(921);
 await atomic(async()=>{await pg.exec('reset role');await pg.query("select set_config('request.jwt.claim.sub','',false)");await pg.query("insert into public.organizations(id,name,join_code,created_by) values($1,'架空施設B','SYNTHETIC-B',$2)",[otherOrg,ADMIN]);await pg.query("insert into public.clients(id,organization_id,code,display_name) values($1,$2,'resident-102','架空利用者B')",[otherClient,otherOrg]);await pg.query('insert into public.care_records(id,organization_id,client_id,created_by,visit_note,care_note) values($1,$2,$3,$4,$5,$6)',[id(951),otherOrg,otherClient,ADMIN,'別施設の秘密の観察',body]);});
 const forbidden=await page.evaluate(async scope=>{const db=supabase.createClient(AI_KIROKU_CONFIG.supabaseUrl,AI_KIROKU_CONFIG.supabasePublishableKey);return (await NexiaRecordSimilarity.load(db,scope)).rows;},{organizationId:otherOrg,clientId:otherClient,actorId:STAFF});assert.deepEqual(forbidden,[]);assert(!(await page.locator('#recordSimilarityNotice').innerText()).includes('別施設の秘密'));
 // Same scoped comparison is available to all three existing roles, without granting edits.
 for(const actor of [ADMIN,EDITOR]){const p=await pageFor(actor,false,false);await p.locator('#user').selectOption('resident-102');await p.waitForLoadState('networkidle');await p.locator('input[name=serviceContent][value="入浴介助"]').check();await p.locator('#condition').selectOption('笑顔が見られた');await p.locator('#factSupportDetails > summary').click();await p.locator('[data-preset="入浴介助-self"]').click();await p.getByRole('button',{name:'AIで記録作成',exact:true}).click();await p.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('未保存'));assert(Number(await p.locator('#recordSimilarityNotice').getAttribute('data-matches'))>0);}
 assert(requests.every(r=>r.organization_id&&r.client_id),'history comparisons always scope facility and resident IDs');
 fs.writeFileSync(path.join(out,width+'-similarity.json'),JSON.stringify({passed:true,width,realPinnedHTML:true,isolatedPostgres:true,explicitSelfShortcut:true,sameFactsSave:true,additionalSimilarityClicks:0,nearMatchAfterEditing:true,readFailureBlocksSave:true,staleComparisonBlocksSave:true,crossFacilityDenied:true,differentResidentExcluded:true,allThreeRoles:true,scopeFilters:requests.map(r=>({organization_id:r.organization_id,client_id:r.client_id,limit:r.limit}))},null,2));
 console.log('PASS record similarity browser',width,'inline exact/near warning, one-click save, optional facts, edits, read failures, stale responses, RLS, all roles');
};
