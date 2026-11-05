const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const base=__dirname+'/../../recruitment/admin/';
const dom=new JSDOM(fs.readFileSync(base+'check.html','utf8'),{runScripts:'outside-only',url:'https://hideyuki062222-cyber.github.io/ai-kiroku-app/recruitment/admin/check.html'}),w=dom.window,$=id=>w.document.getElementById(id);
let options,api,calls=[];
w.BrookApi=class{constructor(){api=this;}async login(){this.token='test';}logout(){this.token=null;}async request(path,opts){calls.push([path,JSON.parse(opts.body)]);return {message:'verified'};}};
w.turnstile={render(target,opts){options=opts;return 'widget';},remove(){}};
w.eval(fs.readFileSync(base+'check.js','utf8'));
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
assert($('check-panel').hidden);assert($('check-button').disabled);
$('email').value='admin@example.com';$('password').value='test';$('login').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
assert($('login').hidden);assert(!$('check-panel').hidden);assert.equal($('password').value,'');assert.equal(options.action,'brook_apply');
options.callback('token-1');assert(!$('check-button').disabled);$('check-button').click();await tick();
assert.equal(calls.length,1);assert.equal(calls[0][0],'/functions/v1/brook-recruitment-check');assert.deepEqual(calls[0][1],{captcha_token:'token-1'});assert.equal($('result').textContent,'verified');assert($('check-button').disabled);
$('retry-button').click();await tick();options.callback('token-2');options['expired-callback']();assert($('check-button').disabled);
const stale=options.callback;$('logout-button').click();stale('stale');assert($('check-panel').hidden);assert($('check-button').disabled);assert.equal(api.token,null);
console.log('UI verified: login, challenge, read-only request, token reuse prevention, expiry, logout/stale callback');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
