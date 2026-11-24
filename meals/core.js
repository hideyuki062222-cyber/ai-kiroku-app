(function(root){
 const meals=['morning','lunch','evening'];const labels={morning:'朝食',lunch:'昼食',evening:'夕食'};
 const kinds={regular:'通常の食事',miso_soup:'みそ汁のみ',rice_ball:'おにぎりのみ'};
 const units={miso_soup:'杯',rice_ball:'個'};
 const defaults={morning:330,lunch:440,evening:550,miso_soup:50,rice_ball:100};
 const days=month=>{const [y,m]=month.split('-').map(Number);return Array.from({length:new Date(Date.UTC(y,m,0)).getUTCDate()},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`)};
 const expected=(p,date,meal)=>Boolean(p&&p[meal]&&date>=p.start_date&&(!p.end_date||date<=p.end_date)&&p.weekdays.includes(new Date(date+'T12:00:00Z').getUTCDay()));
 const key=(id,date,meal)=>[id,date,meal].join('|');
 const originalTotals=rows=>{const out={morning:0,lunch:0,evening:0,amount:0,amounts:{morning:0,lunch:0,evening:0},pending:0,absent:0};for(const r of rows){if(r.status==='served'){out[r.meal]++;out.amount+=r.unit_price;out.amounts[r.meal]+=r.unit_price;}else if(r.status==='planned')out.pending++;else if(r.status==='absent')out.absent++;}return out};
 const totals=rows=>{const out=originalTotals(rows);out.baseAmount=out.amount;out.riceAmount=0;out.riceRefillAmount=0;out.soupRefillAmount=0;out.review=0;out.miso_soup=0;out.rice_ball=0;for(const r of rows){if(r.status!=='served')continue;if(Object.hasOwn(units,r.serving_kind)){out[r.serving_kind]+=r.serving_quantity;continue;}if(r.extra?.state==='needs_review')out.review++;if(r.extra?.state==='ready'){out.riceAmount+=r.extra.rice_amount;out.riceRefillAmount+=r.extra.rice_refill_amount;out.soupRefillAmount+=r.extra.soup_refill_amount;}}out.extraAmount=out.riceAmount+out.riceRefillAmount+out.soupRefillAmount;out.amount+=out.extraAmount;return out};
 const price=(prices,date,meal)=>prices.filter(p=>p.effective_date<=date&&p[meal]!=null).sort((a,b)=>b.effective_date.localeCompare(a.effective_date))[0]?.[meal]??defaults[meal];
 const csvCell=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,s=>"'"+s).replaceAll('"','""')+'"';
 const api={meals,labels,kinds,units,defaults,days,expected,key,totals,price,csvCell};if(typeof module!=='undefined')module.exports=api;else root.MealCore=api;
})(globalThis);
