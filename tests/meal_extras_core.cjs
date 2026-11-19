const assert=require('node:assert/strict'),E=require('../meals/extra-core.js'),C=require('../meals/core.js');let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++};
// These are test fixtures only. The 201-249g gap is deliberately unresolved.
const p={enabled:true,free_limit:200,bands:[{from:250,to:299,amount:50},{from:300,to:null,amount:100}],rice_refill_price:50,soup_refill_price:30};
for(const g of [0,150,200])eq(E.calculate(p,g).total,0);
for(const g of [201,220,249]){eq(E.calculate(p,g,2,2).state,'needs_review');eq(E.calculate(p,g,2,2).total,0);}
eq(E.validate(p),['201〜249gの料金が未設定です。']);eq(E.calculate(p,250).total,50);eq(E.calculate(p,300).total,100);eq(E.calculate(p,250,2,2).total,210);
eq(E.calculate(p,250,2,0).rice_refill_amount,100);eq(E.calculate(p,250,0,2).soup_refill_amount,60);
for(const g of [null,undefined,-1,2001,250.5])eq(E.calculate(p,g).state,'needs_review');
eq(E.calculate({...p,enabled:false},300,2,2).total,0);
const extra={...E.calculate(p,250,2,2),actual_rice:250,rice_refills:2,soup_refills:2};
const served={meal:'morning',status:'served',unit_price:330,extra};const t=C.totals([served]);eq([t.baseAmount,t.riceAmount,t.riceRefillAmount,t.soupRefillAmount,t.extraAmount,t.amount],[330,50,100,60,210,540]);
for(const status of ['planned','absent'])eq(C.totals([{...served,status}]).amount,0);
eq(C.totals([{...served,extra:{...extra,state:'needs_review'}}]).amount,330);eq(C.totals([{...served,extra:{...extra,state:'needs_review'}}]).review,1);
eq(C.totals([{...served,extra:null}]).amount,330);
for(const patch of [{free_limit:-1},{rice_refill_price:-1},{soup_refill_price:null},{bands:[{from:201,to:300,amount:1},{from:300,to:null,amount:2}]},{bands:[{from:201,to:null,amount:null}]}])eq(E.validate({...p,...patch}).length>0,true);
console.log('PASS extra pricing core:',n,'assertions');
