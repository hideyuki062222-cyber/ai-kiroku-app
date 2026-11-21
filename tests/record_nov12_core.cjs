const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../record-facts-core'),'utf8');
const keys=[],values=new Map(),store={getItem(k){keys.push(k);return values.get(k)??null;},setItem(k,v){keys.push(k);values.set(k,v);}};
const load=localStorage=>{const c={localStorage,module:{exports:{}}};vm.runInNewContext(source,c);return c.module.exports;};
const first=load(store);assert.equal(first.nextExpressionSeed(),0);assert.equal(first.nextExpressionSeed(),1);
const reload=load(store);assert.equal(reload.nextExpressionSeed(),2,'generation count continues after reload without a resident signature');
assert.deepEqual([...new Set(keys)],['nexia.record.expression-counter.v1']);assert.equal(values.size,1);assert(/^\d+$/.test([...values.values()][0]));
const blocked=load({getItem(){throw Error('storage blocked');},setItem(){throw Error('quota');}});assert.equal(blocked.nextExpressionSeed(),0);assert.equal(blocked.nextExpressionSeed(),1);
for(const invalid of ['-1','NaN','1.5','{"resident":"private"}']){const c=load({getItem(){return invalid;},setItem(){}});assert.equal(c.nextExpressionSeed(),0);}
const C=require('../record-facts-core'),{minimal,cases,detailed}=require('./fixtures/record_evidence_cases.cjs');
for(const x of cases)for(const lengthMode of ['normal','long']){
 const f={...detailed(x),lengthMode},out=C.compose(f);assert.deepEqual(out.errors,[]);
 for(const re of x.anchors)assert(re.test(out.care));for(const word of x.forbidden)assert(!(out.visit+out.care).includes(word));
 assert(!out.care.includes('\n'),'real narrative prose rather than extra headings or line breaks');assert(out.care.startsWith(C.INTRO));
}
for(const lengthMode of ['short','normal','long']){
 const out=C.compose({...minimal,lengthMode});assert(!/起き上が|返事|支援後|安全確認/.test(out.care));assert(out.care.replace(C.INTRO,'').length<60,'scope-only prose is not padded');
}
console.log('PASS November 12 factual composition and counter: reload, blocked/invalid storage, only an anonymous number persisted, five services x normal/long, sparse facts never padded');
