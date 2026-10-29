const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let calls=[],responses=[],lost=0;
const context={window:{dispatchEvent:()=>lost++},Event:class{},AbortSignal,Date,Error,JSON,encodeURIComponent,fetch:async(url,opt)=>{calls.push({url,opt});const r=responses.shift();if(r instanceof Error)throw r;return {ok:r.status<400,status:r.status,json:async()=>r.body};}};
vm.createContext(context);vm.runInContext(fs.readFileSync('recruitment/api.js','utf8'),context);
const Api=context.window.BrookApi;let checks=0;
async function rejects(fn,re){await assert.rejects(fn,re);checks++;}
(async()=>{
const disabled=new Api({enabled:false});await rejects(()=>disabled.request('/anything'),/準備中/);assert.equal(calls.length,0);checks++;
const api=new Api({enabled:true,url:'https://test.invalid',key:'public-test'});
responses=[{status:200,body:{access_token:'token-fixture',expires_in:3600}},{status:200,body:{id:'user-fixture'}},{status:200,body:[]}];await rejects(()=>api.login('test@example.invalid','test-only'),/権限がありません/);assert.equal(api.token,null);checks++;
responses=[{status:200,body:{access_token:'token-fixture',expires_in:3600}},{status:200,body:{id:'user-fixture'}},{status:200,body:[{user_id:'user-fixture'}]}];await api.login('test@example.invalid','test-only');assert.equal(api.token,'token-fixture');checks++;
responses=[{status:200,body:[]}];await rejects(()=>api.save('jobs',{id:'job',revision:1},{overrides:{}}),/保存できません/);
responses=[new Error('offline')];await rejects(()=>api.save('jobs',{id:'job',revision:1},{overrides:{}}),/通信/);
responses=[{status:403,body:{}}];await rejects(()=>api.request('/rest/v1/recruitment_applicants'),/権限/);assert.equal(api.token,null);assert.equal(lost,1);checks++;
api.token='expired';api.expires=1;await rejects(()=>api.request('/rest/v1/recruitment_applicants'),/有効期限/);assert.equal(lost,2);checks++;
responses=[{status:201,body:{receipt:'receipt-test'}}];assert.equal((await api.apply({})).receipt,'receipt-test');checks++;
assert(!calls.at(-1).opt.headers.Authorization);checks++;
responses=[{status:200,body:{}}];await rejects(()=>api.apply({}),/受付結果/);
assert(calls.filter(c=>c.url.includes('/rest/')).every(c=>c.url.includes('recruitment_')));checks++;
console.log(`${checks} API checks passed (mock transport).`);
})().catch(e=>{console.error(e);process.exitCode=1});
