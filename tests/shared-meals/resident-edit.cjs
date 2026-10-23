const {JSDOM,VirtualConsole}=require(process.env.JSDOM_PATH||'jsdom'),fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('shared-meals/index.html','utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
const make=()=>new JSDOM(html,{url:'https://meal.example.test/',runScripts:'dangerously',beforeParse(w){w.confirm=()=>true;w.print=()=>{};}});
const inject=(w,p)=>{const s=w.document.createElement('script');s.textContent=fs.readFileSync(p,'utf8');w.document.body.append(s);};
(async()=>{let dom=make(),w=dom.window;w.MEAL_CONFIG={};inject(w,'shared-meals/connection.js');inject(w,'shared-meals/core.js');inject(w,'shared-meals/app.js');assert.equal(w.mealDB,null);assert.match(w.document.querySelector('#gate h2').textContent,/接続設定が未完了/);dom.window.close();
dom=make();w=dom.window;inject(w,'tests/shared-meals/fixture.js');w.mealDB=w.supabase.createClient();inject(w,'shared-meals/core.js');inject(w,'shared-meals/app.js');const tick=()=>new Promise(r=>setTimeout(r,10));for(let i=0;i<100&&w.document.getElementById('app').hidden;i++)await tick();assert.equal(w.document.getElementById('app').hidden,false);
let el=w.document.querySelector('[data-status]');el.value='served';el.dispatchEvent(new w.Event('change'));await tick();assert.equal(w.mealTest.data.sm_meal_entries[0].status,'served');w.document.querySelector('[data-tab="bill"]').click();assert.match(w.document.getElementById('view').textContent,/朝食代合計/);assert.match(w.document.getElementById('view').textContent,/330円/);w.document.getElementById('printBill').click();assert.match(w.document.getElementById('print').textContent,/朝食代合計/);
w.document.querySelector('[data-tab="settings"]').click();assert.ok(w.document.getElementById('profileForm'));assert.ok(w.document.getElementById('residentForm'));

const before=JSON.stringify(w.mealTest.data.sm_meal_entries),resident=w.mealTest.data.sm_clients[0],originalId=resident.id;
let f=w.document.getElementById('residentEditForm');assert.ok(f);
f.elements.room.value='102';f.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.match(w.document.getElementById('notice').textContent,/別の利用者/);assert.equal(resident.room_number,'101');
const note=w.document.getElementById('profileForm').elements.note;note.value='編集中の注意事項';note.dispatchEvent(new w.Event('input',{bubbles:true}));
f.elements.room.value='201';f.elements.name.value='変更後の利用者';f.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
assert.equal(resident.id,originalId);assert.equal(resident.display_name,'変更後の利用者');assert.equal(resident.room_number,'201');assert.equal(JSON.stringify(w.mealTest.data.sm_meal_entries),before);assert.equal(note.value,'編集中の注意事項');assert.match(w.document.getElementById('notice').textContent,/ほかの入力は未保存/);assert.match(w.document.querySelector('#profileForm h2').textContent,/201 変更後の利用者/);
resident.display_name='別の職員の変更';f.elements.name.value='競合する変更';f.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(resident.display_name,'別の職員の変更');assert.match(w.document.getElementById('notice').textContent,/他の職員/);
assert.equal(w.document.querySelectorAll('a[href^="../"]').length,0);dom.window.close();console.log('PASS resident edit: preserved history, duplicate room blocked, stale update blocked, other unsaved inputs retained; UI: unconfigured fail-closed, standalone links, shared save, meal subtotals, print, resident settings');
})().catch(e=>{console.error(e);process.exitCode=1;});
