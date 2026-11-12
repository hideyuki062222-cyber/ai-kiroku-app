const {JSDOM}=require(process.env.JSDOM_PATH),fs=require('node:fs'),assert=require('node:assert/strict');
const tick=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
  const state={role:'admin',active:true,user:{id:'synthetic'},error:false};let notify;
  const db={auth:{getUser:async()=>({data:{user:state.user},error:null}),onAuthStateChange:fn=>notify=fn},from:table=>{
    const q={select:()=>q,eq:()=>q,maybeSingle:()=>q,then:resolve=>resolve({data:table==='organizations'?{is_active:state.active}:{role:state.role},error:state.error?Error('offline'):null})};return q;
  }};
  const d=new JSDOM('<nav class="app-nav"></nav><select id="orgSwitch"><option>a</option><option>b</option></select>',{url:'https://example.test/ai-kiroku-app/dashboard/',runScripts:'outside-only'}),w=d.window;
  w.localStorage.setItem('activeOrganizationId','a');w.supabase={createClient:()=>db};w.eval(fs.readFileSync('admin-link.js','utf8'));await tick();assert(w.document.querySelector('[data-admin-home]'));
  state.role='staff';w.localStorage.setItem('activeOrganizationId','b');w.document.getElementById('orgSwitch').dispatchEvent(new w.Event('change',{bubbles:true}));assert(!w.document.querySelector('[data-admin-home]'));await tick();assert(!w.document.querySelector('[data-admin-home]'));
  state.role='admin';w.dispatchEvent(new w.Event('focus'));await tick();assert(w.document.querySelector('[data-admin-home]'));
  state.active=false;w.dispatchEvent(new w.Event('focus'));await tick();assert(!w.document.querySelector('[data-admin-home]'));
  state.active=true;state.error=true;w.dispatchEvent(new w.Event('focus'));await tick();assert(!w.document.querySelector('[data-admin-home]'));
  state.error=false;state.user=null;notify('SIGNED_OUT',null);await tick();assert(!w.document.querySelector('[data-admin-home]'));
  w.close();console.log('PASS NEXIA admin navigation: facility/role changes, inactive facility, errors and sign-out');
})().catch(e=>{console.error(e);process.exit(1)});
