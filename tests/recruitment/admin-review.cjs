const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('recruitment/admin/index.html','utf8').replace(/<script[^>]*src[^>]*><\/script>/g,'');
const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://preview.example.invalid/admin/'}),w=dom.window,d=w.document;
w.confirm=()=>true;w.scrollTo=()=>{};w.BROOK_CONFIG={enabled:true};
let reads=[],writes=0,applies=0;
w.eval(fs.readFileSync('recruitment/core.js','utf8'));
const data=w.BrookCore.initial();
for(const l of data.locations){l.address='非公開住所 '+l.code;l.access=l.code==='sakai'?'':'テスト駅';}
for(const k of Object.keys(w.BrookCore.fields))data.templates[0].terms[k]='保存済み '+k;
data.templates[0].terms.salary='資格別月給271,020円〜。夜勤手当は別途5,000円／回';
data.settings.privacy_text='180日後に削除';data.settings.contact_text='採用窓口';data.settings.retention_days=180;
data.applicants=[];
class MockApi{async login(){} async load(admin){reads.push(admin);return structuredClone(data);} logout(){} async save(){writes++;throw Error('unexpected write');}async apply(){applies++;throw Error('unexpected application');}}
w.BrookApi=MockApi;
for(const f of ['content.js','app.js'])w.eval(fs.readFileSync('recruitment/'+f,'utf8'));
const click=text=>{const b=[...d.querySelectorAll('button')].find(x=>x.textContent===text);assert(b,text);b.click();};
const tick=()=>new Promise(r=>setImmediate(r));let n=0;const check=(v,msg)=>{assert(v,msg);console.log('PASS '+msg);n++;};
(async()=>{
 check(reads.length===0,'admin entry does not race anonymous data load against login');
 d.querySelector('[data-page="review"]').click();check(!d.body.textContent.includes('非公開住所'),'review requires admin even with direct navigation');
 click('採用担当者ログイン');d.getElementById('login-email').value='test@example.invalid';d.getElementById('login-password').value='test';
 d.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await tick();await tick();
 click('公開前の求人確認');check(d.body.textContent.includes('非公開住所 gamo')&&d.body.textContent.includes('保存済み title'),'review shows saved location and terms');
 check(d.body.textContent.includes('BROOKで働く魅力')&&d.body.textContent.includes('資格を活かし'),'company benefits are present in live mode');
 check(d.body.textContent.includes('夜勤手当は別途5,000円／回'),'night allowance remains separate');
 check(!d.querySelector('form')&&![...d.querySelectorAll('button')].some(b=>b.textContent.includes('応募する')),'review offers no application form or submit button');
 click('COZY豊中');check(d.body.textContent.includes('非公開住所 toyonaka'),'Toyonaka review works');
 click('COZY堺');check(d.body.textContent.includes('公開前に設定が必要：交通アクセス'),'missing Sakai access is flagged');
 click('勤務地別設定へ戻る');check(d.getElementById('address').value==='非公開住所 sakai','return preserves selected location');
 d.getElementById('address').value='未保存住所';d.getElementById('address').dispatchEvent(new w.Event('input'));w.confirm=()=>false;click('保存済みの求人を確認');check(!!d.querySelector('form'),'unsaved input is protected');
 w.confirm=()=>true;click('保存済みの求人を確認');check(d.body.textContent.includes('非公開住所 sakai')&&!d.body.textContent.includes('未保存住所'),'review uses saved values only');
 click('ログアウト');d.querySelector('[data-page="review"]').click();click('求人を探す');check(!d.body.textContent.includes('非公開住所'),'logout clears unpublished addresses');
 check(writes===0&&applies===0&&reads.every(Boolean),'review never writes data, applies, or enables publication');
 check(w.localStorage.length===0&&w.sessionStorage.length===0,'no private data persisted to browser storage');
 console.log(n+' admin review checks passed.');w.close();
})().catch(e=>{console.error(e);w.close();process.exitCode=1;});
