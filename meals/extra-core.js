(function(root){
 'use strict';
 const integer=(v,max=100000)=>Number.isInteger(v)&&v>=0&&v<=max;
 function validate(p){
  const errors=[];if(!integer(p.free_limit,2000)||!integer(p.rice_refill_price)||!integer(p.soup_refill_price))errors.push('上限・単価は0以上の整数で入力してください。');
  if(!Array.isArray(p.bands)||p.bands.length>100)return ['料金区分を確認してください。'];
  let end=p.free_limit;
  for(const b of p.bands.slice().sort((a,b)=>a.from-b.from)){
   const hi=b.to===null?2000:b.to;
   if(!integer(b.from,2000)||!integer(hi,2000)||!integer(b.amount)||hi<b.from)errors.push('区分の開始・終了グラム数と料金を入力してください。');
   if(b.from<=end)errors.push('料金区分が重複しています。');
   if(b.from>end+1)errors.push(`${end+1}〜${b.from-1}gの料金が未設定です。`);
   end=hi;
  }
  if(end<2000)errors.push(`${end+1}〜2000gの料金が未設定です。`);
  return errors;
 }
 function calculate(p,grams,rice=0,soup=0){
  const zero={rice_amount:0,rice_refill_amount:0,soup_refill_amount:0,total:0};
  if(!p?.enabled)return {...zero,state:'disabled'};
  if(!integer(grams,2000)||!integer(rice,100)||!integer(soup,100))return {...zero,state:'needs_review'};
  const hits=grams<=p.free_limit?[{amount:0}]:(p.bands||[]).filter(b=>grams>=b.from&&grams<=(b.to??2000));
  if(hits.length!==1||!integer(hits[0].amount)||!integer(p.rice_refill_price)||!integer(p.soup_refill_price))return {...zero,state:'needs_review'};
  const a=hits[0].amount,b=rice*p.rice_refill_price,c=soup*p.soup_refill_price;
  return {rice_amount:a,rice_refill_amount:b,soup_refill_amount:c,total:a+b+c,state:'ready'};
 }
 const amounts=r=>r.status==='served'&&r.extra?.state==='ready'?{rice:r.extra.rice_amount,riceRefill:r.extra.rice_refill_amount,soupRefill:r.extra.soup_refill_amount}:{rice:0,riceRefill:0,soupRefill:0};
 const api={validate,calculate,amounts};if(typeof module!=='undefined')module.exports=api;else root.MealExtras=api;
})(globalThis);
