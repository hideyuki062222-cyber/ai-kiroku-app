const assert=require('node:assert/strict'),C=require('../meals/core.js');
assert.equal(C.days('2028-02').length,29);assert.equal(C.days('2026-02').length,28);assert.equal(C.days('2026-12').at(-1),'2026-12-31');
const p={start_date:'2026-10-01',end_date:'2026-10-31',morning:true,lunch:false,evening:true,weekdays:[1,2,3,4,5]};
assert.equal(C.expected(p,'2026-10-23','morning'),true);assert.equal(C.expected(p,'2026-10-24','morning'),false);assert.equal(C.expected(p,'2026-10-23','lunch'),false);assert.equal(C.expected(p,'2026-11-02','morning'),false);
const t=C.totals([{meal:'morning',status:'served',unit_price:330},{meal:'lunch',status:'served',unit_price:440},{meal:'evening',status:'served',unit_price:550},{meal:'evening',status:'absent',unit_price:550},{meal:'morning',status:'planned',unit_price:330}]);assert.equal(t.amount,1320);assert.equal(t.absent,1);assert.equal(t.pending,1);assert.equal(t.evening,1);
assert.equal(C.price([{effective_date:'2026-11-01',morning:400}],'2026-10-23','morning'),330);assert.equal(C.price([{effective_date:'2026-11-01',morning:400}],'2026-11-01','morning'),400);assert.ok(C.csvCell('=cmd').startsWith('"\''));console.log('PASS meal totals, absence, pending, effective dates, schedules, leap year, CSV escaping');

const mixed=C.totals([{meal:'morning',status:'served',unit_price:330},{meal:'morning',status:'served',unit_price:350},{meal:'lunch',status:'served',unit_price:440},{meal:'evening',status:'served',unit_price:550},{meal:'lunch',status:'absent',unit_price:440},{meal:'evening',status:'planned',unit_price:550}]);
assert.deepEqual(mixed.amounts,{morning:680,lunch:440,evening:550});assert.equal(Object.values(mixed.amounts).reduce((a,b)=>a+b,0),mixed.amount);assert.deepEqual(C.totals([]).amounts,{morning:0,lunch:0,evening:0});console.log('PASS meal subtotals: mixed historical prices, absent/planned exclusion, zero rows');

const singles=C.totals([
 {meal:'morning',status:'served',unit_price:50,serving_kind:'miso_soup',serving_quantity:1,extra:{state:'needs_review'}},
 {meal:'lunch',status:'served',unit_price:200,serving_kind:'rice_ball',serving_quantity:2,extra:{state:'ready',rice_amount:50,rice_refill_amount:100,soup_refill_amount:30}},
 {meal:'evening',status:'absent',unit_price:100,serving_kind:'rice_ball',serving_quantity:1},
]);
assert.deepEqual(singles.amounts,{morning:50,lunch:200,evening:0});
assert.equal(singles.amount,250);
assert.equal(singles.miso_soup,1);
assert.equal(singles.rice_ball,2);
assert.equal(singles.review,0);
assert.equal(singles.extraAmount,0);
const rates=[{effective_date:'2026-11-24',miso_soup:0,rice_ball:120},{effective_date:'2026-12-01',miso_soup:null,rice_ball:150}];
assert.equal(C.price(rates,'2026-11-23','miso_soup'),50);
assert.equal(C.price(rates,'2026-12-01','miso_soup'),0);
assert.equal(C.price(rates,'2026-11-24','rice_ball'),120);
assert.equal(C.price(rates,'2026-12-01','rice_ball'),150);
console.log('PASS single items: dated rates, quantity, absence and exclusion from rice and refill charges');
