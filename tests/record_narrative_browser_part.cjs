// Runs inside the existing real-HTML/SDK/isolated-Postgres fixture. No production calls.
module.exports=async function({pageFor,STAFF,width,out}){
 const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const results=[];
 for(const mode of ['normal','long']){
  const page=await pageFor(STAFF,false,false);await page.locator('#user').selectOption('resident-101');await page.waitForLoadState('networkidle');
  await page.locator('#interventionLevel').selectOption('prompt');await page.locator('input[name=serviceContent][value="服薬介助・確認"]').check();
  await page.locator('#visitScene').selectOption('椅子・座椅子に座っていた');await page.locator('#condition').selectOption('笑顔が見られた');
  await page.locator('#factSupportDetails > summary').click();await page.locator('[data-preset="服薬介助・確認-2"]').click();await page.locator('[data-reaction][value="声かけにうなずいて応じた"]').check();
  await page.locator('[data-service-details]').evaluate(e=>e.open=true);await page.locator('.fact-methods').evaluate(e=>e.open=true);await page.locator('[data-method][value="ゆっくり話した"]').check();await page.locator('[data-after]').selectOption('椅子に座って過ごした');
  await page.locator('#length').evaluate(e=>e.closest('details').open=true);await page.locator('#length').selectOption(mode);
  const fixed=await page.evaluate(()=>NexiaFactUI.collect()),runs=[];
  for(let n=1;n<=30;n++){
   await page.getByRole('button',{name:'AIで記録作成',exact:true}).click();await page.waitForFunction(()=>document.getElementById('recordSaveStatus').textContent.includes('未保存'));
   const row=await page.evaluate(()=>({visit:document.getElementById('visitResult').textContent,care:document.getElementById('careResult').textContent,facts:NexiaFactUI.collect()}));
   assert.deepEqual(row.facts,fixed,'same facts on every generation');assert(row.visit.includes('椅子・座椅子に座って'));assert(/笑顔が見(?:られ|受けられ)ました/.test(row.visit));
   assert(row.care.startsWith('指示内容確認しました。前回のサービス記録確認しました。'));assert(row.care.includes('今回は声かけ・促しを中心に支援しました'));assert(/うなず(?:いて|きで)応じられました/.test(row.care));assert(row.care.includes('ゆっくり話しました'));assert(row.care.includes('支援後は、椅子に座って過ごされました'));assert(/服用済みかは確認して(?:いません|おらず)/.test(row.care));
   assert(!/服用されたこと|安全確認|副作用|発熱|血圧|痛み|薬を準備/.test(row.care+row.visit));assert(!/ましました|まし、|ました、/.test(row.visit+row.care));
   runs.push({number:n,visit:row.visit,care:row.care});
  }
  const stats=key=>{const groups=new Map();let adjacent=0;for(let i=0;i<runs.length;i++){const value=key==='pair'?runs[i].visit+'\n'+runs[i].care:runs[i][key];if(!groups.has(value))groups.set(value,[]);groups.get(value).push(i+1);if(i&&value===(key==='pair'?runs[i-1].visit+'\n'+runs[i-1].care:runs[i-1][key]))adjacent++;}return {unique:groups.size,repeatOccurrences:runs.length-groups.size,matchingPairs:[...groups.values()].reduce((n,x)=>n+x.length*(x.length-1)/2,0),adjacentMatches:adjacent,groups:[...groups].map(([text,indices])=>({text,indices,count:indices.length}))};};
  results.push({mode,person:'架空利用者101',actor:'架空の同一職員',intervention:'prompt',history:'架空の無関係な既存記録1件を固定。30回とも正式保存せず、直前生成は画面内で参照。各モードは新しいページで開始。',facts:fixed,runs,statistics:{visit:stats('visit'),care:stats('care'),pair:stats('pair')}});
  assert((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1,'no mobile/desktop overflow');
  await page.locator('#careResult').screenshot({path:path.join(out,width+'-'+mode+'-narrative.png')});
  await page.close();
 }
 const sourceHashes=Object.fromEntries(['record-facts-core.js','record-similarity.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex')]));
 fs.writeFileSync(path.join(out,width+'-thirty.json'),JSON.stringify({width,sourceHashes,actualPinnedHTML:true,isolatedPostgres:true,productionTouched:false,results},null,2));
 console.log('PASS 30 actual generations:',width,JSON.stringify(results.map(r=>({mode:r.mode,statistics:Object.fromEntries(Object.entries(r.statistics).map(([k,v])=>[k,{...v,groups:undefined}]))}))));
};
