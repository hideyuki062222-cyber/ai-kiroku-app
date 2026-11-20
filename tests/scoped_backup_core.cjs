const assert=require('node:assert/strict'),{parseBackup}=require('../tools/scoped-backup-data.cjs');let checks=0;
const good=(source,expected)=>{const b=Buffer.from(source);assert.deepEqual(parseBackup(b),expected);assert(b.every(x=>x===0));checks+=2;};
const bad=source=>{const b=Buffer.from(source);assert.throws(()=>parseBackup(b));assert(b.every(x=>x===0));checks+=2;};
good('{"name":"架空利用者","amount":12345,"weight":52.5}',{name:'架空利用者',amount:12345,weight:52.5});
good('{"amount":9007199254740991,"sequence":"9223372036854775807"}',{amount:Number.MAX_SAFE_INTEGER,sequence:'9223372036854775807'});
for(const amount of ['9007199254740992','9007199254740993','-9007199254740993'])bad('{"rows":[{"amount":'+amount+'}]}');
bad('{"broken":');
console.log('PASS encrypted backup data:',checks,'assertions; exact integers, no silent rounding, and buffer clearing on success/failure');
