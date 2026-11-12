// Synthetic accounts only. No remote requests, real credentials or database writes.
const {JSDOM}=require(process.env.JSDOM_PATH),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('home/index.html','utf8'),script=fs.readFileSync('home/app.js','utf8');
const tick=()=>new Promise(r=>setTimeout(r,15));
function fixture(options={}){
  const state={user:options.signedOut?null:{id:'user-1'},members:[{organization_id:'a',role:'admin',staff_name:'テスト管理者'},{organization_id:'b',role:'staff',staff_name:'テスト職員'}],orgs:[{id:'a',name:'施設A',is_active:true},{id:'b',name:'施設B',is_active:true}],calls:[],...options};
  state.members=state.members.map(m=>({user_id:'user-1',...m}));state.updates=[];
  const db={auth:{
    getUser:async()=>({data:{user:state.user},error:state.authError||null}),
    onAuthStateChange:fn=>{state.authChanged=fn;return {data:{subscription:{unsubscribe(){}}}}},
    signInWithPassword:async args=>{state.calls.push(['login',args]);if(state.loginError)return {error:Error('invalid')};state.user={id:'user-1'};state.authChanged('SIGNED_IN',{user:state.user});return {data:{session:{user:state.user}},error:null}},
    signOut:async()=>{state.calls.push(['logout']);if(state.logoutError)return {error:Error('offline')};state.user=null;state.authChanged('SIGNED_OUT',null);return {error:null}}
  },from:table=>{
    const filters=[],equalities=[];let single=false,payload;
    const q={select:cols=>{state.calls.push(['select',table,cols]);return q},update:value=>{payload=value;return q},eq:(key,value)=>{filters.push(x=>x[key]===value);equalities.push([key,value]);return q},in:(key,values)=>{filters.push(x=>values.includes(x[key]));return q},maybeSingle:()=>{single=true;return q},then:async resolve=>{
      if(state.beforeQuery)await state.beforeQuery(table,payload?'update':'select');
      let rows=table==='organization_members'?state.members:state.orgs;
      rows=rows.filter(x=>filters.every(f=>f(x)));
      if(payload){state.updates.push({table,payload,equalities});if(state.saveError||state.zeroUpdate)rows=[];else rows.forEach(row=>Object.assign(row,payload));}
      resolve({data:single?(rows[0]||null):rows.map(x=>({...x})),error:state.queryError||(payload&&state.saveError)?Error('offline'):null});
    }};return q;
  }};
  const dom=new JSDOM(html,{url:'https://example.test/ai-kiroku-app/home/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,$=id=>w.document.getElementById(id);
  w.supabase={createClient:(url,key,config)=>{state.client={url,key,config};return db}};
  if(options.saved)w.localStorage.setItem('activeOrganizationId',options.saved);
  w.eval(fs.readFileSync('staff-name.js','utf8'));w.eval(script);
  return {dom,w,$,state,db,close:()=>w.close()};
}
const submit=f=>{f.$('email').value='synthetic@example.invalid';f.$('password').value='synthetic-password';f.$('loginForm').dispatchEvent(new f.w.Event('submit',{cancelable:true}))};
(async()=>{
  let cases=0;
  {
    const f=fixture({signedOut:true});await tick();assert(!f.$('login').hidden);assert(f.$('portal').hidden);assert.equal(f.state.calls.length,0);
    submit(f);await tick();assert(!f.$('portal').hidden);assert(f.$('login').hidden);assert.equal(f.$('password').value,'');
    assert.equal(f.state.calls.filter(c=>c[0]==='login').length,1);assert.equal(f.state.client.config.auth.persistSession,true);
    const links=[...f.w.document.querySelectorAll('#tools a')];assert.equal(links.length,7);
    assert.deepEqual(links.map(a=>new URL(a.href).pathname),['/ai-kiroku-app/dashboard/','/ai-kiroku-app/','/ai-kiroku-app/assignment/','/ai-kiroku-app/handoff/','/ai-kiroku-app/attendance/','/ai-kiroku-app/meals/','/ai-kiroku-app/cashbook/']);
    assert.equal(new URL(links[1].href).search,'?app=record');f.close();cases+=2;
  }
  {
    const f=fixture({signedOut:true,loginError:true});await tick();submit(f);await tick();assert(!f.$('login').hidden);assert(f.$('portal').hidden);assert.match(f.$('status').textContent,/ログインできません/);assert(!f.$('loginButton').disabled);f.close();cases++;
  }
  {
    const f=fixture({saved:'b'});await tick();assert(!f.$('portal').hidden);assert(f.$('admin').hidden);assert.equal(f.$('organization').value,'b');assert.equal(f.state.calls.filter(c=>c[0]==='login').length,0);
    f.$('organization').value='a';f.$('organization').dispatchEvent(new f.w.Event('change'));assert(f.$('portal').hidden);await tick();assert(!f.$('admin').hidden);assert.equal(f.w.localStorage.getItem('activeOrganizationId'),'a');
    f.$('organization').value='b';f.$('organization').dispatchEvent(new f.w.Event('change'));assert(f.$('admin').hidden);await tick();assert(f.$('admin').hidden);assert.equal(f.w.localStorage.getItem('activeOrganizationId'),'b');f.close();cases+=2;
  }
  for(const opts of [{saved:'forged'},{saved:'inactive',orgs:[{id:'inactive',name:'停止施設',is_active:false},{id:'b',name:'施設B',is_active:true}]}]){
    const f=fixture(opts);await tick();assert(!f.$('portal').hidden);assert.notEqual(f.$('organization').value,opts.saved);assert(![...f.$('organization').options].some(o=>o.value===opts.saved));f.close();cases++;
  }
  for(const opts of [{members:[]},{members:[{organization_id:'a',role:'owner'}]},{orgs:[{id:'a',name:'停止',is_active:false}]}]){
    const f=fixture(opts);await tick();assert(f.$('portal').hidden);assert(!f.$('unavailable').hidden);assert(f.$('admin').hidden);assert.equal(f.w.localStorage.getItem('activeOrganizationId'),null);f.close();cases++;
  }
  {
    const f=fixture();await tick();f.state.members[0].role='staff';f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));assert(f.$('admin').hidden);await tick();assert(f.$('admin').hidden);assert.equal(f.$('role').textContent,'一般職員');
    f.state.members=[];f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));await tick();assert(!f.$('unavailable').hidden);assert(f.$('portal').hidden);f.close();cases+=2;
  }
  {
    const f=fixture({queryError:true});await tick();assert(f.$('portal').hidden);assert(!f.$('retry').hidden);f.state.queryError=false;f.$('retry').click();await tick();assert(!f.$('portal').hidden);f.close();cases++;
  }
  {
    const f=fixture({authError:{status:503}});await tick();assert(f.$('portal').hidden);assert(f.$('login').hidden);assert(!f.$('retry').hidden);f.close();cases++;
  }
  {
    const f=fixture();await tick();f.w.localStorage.setItem('aiKirokuUsers','cached');f.$('logout').click();await tick();assert(f.$('portal').hidden);assert(!f.$('login').hidden);assert.equal(f.w.localStorage.getItem('aiKirokuUsers'),null);assert.equal(f.w.localStorage.getItem('activeOrganizationId'),null);f.close();cases++;
  }
  {
    const f=fixture({logoutError:true});await tick();f.$('logout').click();await tick();assert(f.$('portal').hidden);assert.match(f.$('status').textContent,/ログアウトできません/);assert(!f.$('logout').disabled);assert(!f.$('retry').hidden);f.close();cases++;
  }
  {
    let release;const pending=new Promise(r=>release=r);const f=fixture({beforeQuery:()=>pending});await tick();f.state.user=null;f.state.authChanged('SIGNED_OUT',null);release();await tick();assert(f.$('portal').hidden);assert(!f.$('login').hidden);f.close();cases++;
  }
  {
    const f=fixture();await tick();f.state.members[0].staff_name='<img src=x onerror=alert(1)>';f.state.orgs[0].name='<script>bad()</script>';f.$('retry').click();await tick();assert.equal(f.$('identity').querySelector('img'),null);assert.equal(f.$('organization').querySelector('script'),null);f.close();cases++;
  }
  {
    const f=fixture();await tick();f.w.localStorage.setItem('activeOrganizationId','b');f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'activeOrganizationId'}));await tick();assert.equal(f.$('organization').value,'b');assert(f.$('admin').hidden);
    f.state.user=null;f.state.authChanged('SIGNED_OUT',null);assert(f.$('portal').hidden);f.close();cases++;
  }
  const saveName=(f,name)=>{f.$('staffName').value=name;f.$('staffName').dispatchEvent(new f.w.Event('input'));f.$('nameForm').dispatchEvent(new f.w.Event('submit',{cancelable:true}))};
  for(const value of ['', '　 ', '\u200B\u2060', '氏名未設定','職員名未登録']){
    const f=fixture({members:[{organization_id:'a',role:'admin',staff_name:value}]});await tick();assert(!f.$('nameRegistration').hidden);assert(f.$('businessMenu').hidden);assert(f.$('admin').hidden);assert.match(f.$('nameFacility').textContent,/施設A/);f.close();cases++;
  }
  {
    const f=fixture({members:[{organization_id:'a',role:'admin',staff_name:''},{organization_id:'b',role:'staff',staff_name:'既存職員'}]});await tick();
    for(const value of ['　 ','\u200B','氏名未設定','あ'.repeat(81)])saveName(f,value);
    assert.equal(f.state.updates.length,0);assert(f.$('businessMenu').hidden);
    saveName(f,'  山田 太郎  ');await tick();assert.equal(f.state.updates.length,1);assert.deepEqual(JSON.parse(JSON.stringify(f.state.updates[0].payload)),{staff_name:'山田 太郎'});assert.deepEqual(f.state.updates[0].equalities,[['organization_id','a'],['user_id','user-1'],['staff_name','']]);assert.equal(f.state.members[1].staff_name,'既存職員');assert.equal(f.state.members[0].role,'admin');assert(!f.$('businessMenu').hidden);assert(!f.$('admin').hidden);assert(f.$('nameRegistration').hidden);
    f.$('retry').click();await tick();assert(f.$('nameRegistration').hidden);assert.equal(f.state.updates.length,1);f.close();cases+=3;
  }
  for(const mode of ['saveError','zeroUpdate']){
    const f=fixture({members:[{organization_id:'a',role:'staff',staff_name:''}],[mode]:true});await tick();saveName(f,'山田 太郎');await tick();assert(f.$('businessMenu').hidden);assert(!f.$('nameRegistration').hidden);assert.equal(f.$('staffName').value,'山田 太郎');assert.match(f.$('nameStatus').textContent,/登録できません/);assert(!f.$('saveStaffName').disabled);f.state[mode]=false;saveName(f,'山田 太郎');await tick();assert(!f.$('businessMenu').hidden);assert(f.$('admin').hidden);f.close();cases++;
  }
  {
    const f=fixture({members:[{organization_id:'a',role:'admin',staff_name:'既存名'},{organization_id:'b',role:'staff',staff_name:''}]});await tick();assert(f.$('nameRegistration').hidden);f.$('organization').value='b';f.$('organization').dispatchEvent(new f.w.Event('change'));await tick();assert(!f.$('nameRegistration').hidden);assert.match(f.$('nameFacility').textContent,/施設B/);saveName(f,'施設Bの職員');await tick();assert.equal(f.state.members[0].staff_name,'既存名');assert.equal(f.state.members[1].staff_name,'施設Bの職員');assert(f.$('admin').hidden);f.close();cases++;
  }
  {
    const f=fixture({members:[{organization_id:'a',role:'staff',staff_name:''}]});await tick();f.state.members[0].staff_name='別端末で登録した名前';saveName(f,'古い画面の名前');await tick();assert.equal(f.state.members[0].staff_name,'別端末で登録した名前');assert(f.$('businessMenu').hidden);f.$('retry').click();await tick();assert(!f.$('businessMenu').hidden);f.close();cases++;
  }
  {
    let release;const pending=new Promise(r=>release=r),f=fixture({members:[{organization_id:'a',role:'staff',staff_name:''}],beforeQuery:(_table,op)=>op==='update'?pending:Promise.resolve()});await tick();saveName(f,'保存途中の名前');await tick();f.$('logout').click();await tick();release();await tick();assert(!f.$('login').hidden);assert(f.$('portal').hidden);f.close();cases++;
  }
  {
    const f=fixture();await tick();const validate=f.w.NexiaStaffName.returnPath;
    for(const value of ['https://evil.invalid/','//evil.invalid/','javascript:alert(1)','/ai-kiroku-app/home/','/ai-kiroku-app/../other/','/ai-kiroku-app/?access_token=secret'])assert.equal(validate(value),'');
    assert.equal(validate('/ai-kiroku-app/?from=assignment&assignment=a&returnDashboard=t'),'/ai-kiroku-app/?from=assignment&assignment=a&returnDashboard=t');f.close();cases++;
  }
  const root=[...fs.readFileSync('index.html','utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1];
  for(const url of ['https://example.test/ai-kiroku-app/','https://example.test/ai-kiroku-app/index.html','https://example.test/ai-kiroku-app/?app=record','https://example.test/ai-kiroku-app/?from=assignment&assignment=a&returnDashboard=t','https://example.test/ai-kiroku-app/?from=record&record=r','https://example.test/ai-kiroku-app/#access_token=synthetic']){
    let target='',requests=0;const u=new URL(url);
    vm.runInNewContext(root,{location:{search:u.search,hash:u.hash,replace:t=>target=t},fetch:async()=>{requests++;return {ok:true,text:async()=>''}},document:{getElementById:()=>({textContent:''})}});await tick();
    assert.equal(target,(!u.search&&!u.hash)?'./home/':'');assert.equal(requests,(!u.search&&!u.hash)?0:2);cases++;
  }
  const nav=fs.readFileSync('common-nav.js','utf8');
  for(const path of ['/?app=record','/dashboard/','/assignment/','/handoff/','/attendance/','/meals/','/cashbook/','/admin/','/staff/','/manage/']){
    const d=new JSDOM('<nav class="app-nav"></nav>',{url:'https://example.test/ai-kiroku-app'+path,runScripts:'outside-only'});d.window.eval(nav);
    const back=[...d.window.document.querySelectorAll('a')].find(a=>a.textContent==='NEXIAトップ');assert(back);assert.equal(back.pathname,'/ai-kiroku-app/home/');assert(d.window.document.querySelector('a[href="/ai-kiroku-app/?app=record"]'));d.window.close();cases++;
  }
  console.log(`PASS NEXIA: ${cases} cases (login, session reuse, facilities, roles, errors, logout races, deep URLs and return navigation)`);
})().catch(e=>{console.error(e);process.exit(1)});
