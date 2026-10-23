const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom'),fs=require('node:fs'),assert=require('node:assert/strict');
const html=p=>fs.readFileSync(p,'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
const inject=(w,p)=>w.eval(fs.readFileSync(p,'utf8'));
const tick=()=>new Promise(r=>setTimeout(r,10));
(async()=>{
 let d=new JSDOM(html('shared-meals/manage.html'),{url:'https://meal.example.test/manage.html',runScripts:'dangerously'}),w=d.window;
 inject(w,'tests/shared-meals/fixture.js');w.mealDB=w.supabase.createClient();w.mealTest.data.sm_organization_members=[];
 w.mealDB.rpc=async name=>({data:name==='sm_meal_can_create_facility'});inject(w,'shared-meals/manage.js');await tick();await tick();
 assert.equal(w.document.getElementById('admin').hidden,false,w.document.getElementById('status').textContent);assert.equal(w.document.getElementById('newOffice').hidden,false);assert.equal(w.document.getElementById('role').textContent,'全体管理者');assert.match(w.document.getElementById('residents').textContent,/サンプル利用者A/);d.window.close();
 d=new JSDOM(html('shared-meals/login.html'),{url:'https://meal.example.test/login.html',runScripts:'dangerously'});w=d.window;let calls=0;
 w.mealDB={auth:{signUp:async()=>{calls++;return {data:{session:{}}};}}};inject(w,'shared-meals/login.js');
 const form=w.document.getElementById('signupForm');form.elements.email.value='staff@example.test';form.elements.password.value='test-only-password';form.elements.confirm.value='does-not-match';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(calls,0);assert.match(w.document.getElementById('signupStatus').textContent,/一致しません/);
 form.elements.confirm.value='test-only-password';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(calls,1);assert.match(w.document.getElementById('signupStatus').textContent,/管理者に施設への追加/);d.window.close();
 console.log('PASS overall administrator UI without facility membership; signup mismatch and membership approval guidance');
})().catch(e=>{console.error(e);process.exitCode=1;});
