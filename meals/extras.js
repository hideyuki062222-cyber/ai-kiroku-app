'use strict';
function latestBill(){return S.bills.at(-1);}
function displayedBill(){return S.bills.find(b=>b.id===S.billViewId&&b.is_final)||(latestBill()?.is_final?latestBill():null);}
function billEntries(){return displayedBill()?.entries||S.entries;}
function billClients(){return displayedBill()?.clients||S.clients;}
function extraColumns(t){return ['baseAmount','riceAmount','riceRefillAmount','soupRefillAmount','extraAmount'].map(k=>`<td class="money">${(t[k]||0).toLocaleString()}円</td>`).join('');}
function extraControl(id,d,m){
 const r=entry(id,d,m);if(r?.status!=='served')return '';
 if(!r.extra)return '<small>導入前の提供記録：追加料金対象外</small>';
 const x=r.extra,a=MealExtras.amounts(r),sum=a.rice+a.riceRefill+a.soupRefill;
 return `<details class="extra-control"><summary>${x.state==='needs_review'?'追加料金：要確認':`追加料金 ${sum.toLocaleString()}円`} ／ おかわり入力</summary><form data-extra="${id}" data-date="${d}" data-meal="${m}"><p>最初の白米量と、おかわり回数を別々に記録します。設定量は自動で実提供量にしません。</p><label>実際に提供した最初の白米（g）<input name="grams" type="number" min="0" max="2000" step="1" value="${x.actual_rice??''}" placeholder="未確認"></label><button type="button" data-copy-rice="${r.rice_grams}">設定量 ${r.rice_grams}g を確認して入力</button>${[['rice','白米',x.rice_refills],['soup','みそ汁',x.soup_refills]].map(([k,label,n])=>`<label>${label}のおかわり回数<div class="refill-stepper"><button type="button" data-step="${k}" data-delta="-1" aria-label="${label}のおかわりを減らす">−</button><input name="${k}" type="number" min="0" max="100" step="1" value="${n}" required><button type="button" data-step="${k}" data-delta="1" aria-label="${label}のおかわりを増やす">＋</button></div></label>`).join('')}<p data-preview role="status"></p><p class="muted">未確認の量・未設定区分がある場合、追加料金は請求せず要確認になります。保存前の入力は他端末に反映されません。</p><button class="primary" type="submit" ${latestBill()?.is_final||d<today()&&!admin()?'disabled':''}>量・おかわりを保存</button><small>最終入力：${esc(x.updated_by_name)} ／ ${new Date(x.updated_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</small>${d<today()&&!admin()?'<p>過去日の訂正は管理者が理由を記録して行います。</p>':''}</form></details>`;
}
function bandRow(b={from:'',to:'',amount:''}){return `<tr><td><input data-band="from" type="number" min="0" max="2000" step="1" value="${b.from}" required aria-label="開始グラム"></td><td><input data-band="to" type="number" min="0" max="2000" step="1" value="${b.to??''}" placeholder="上限なし" aria-label="終了グラム（空欄は2000gまで）"></td><td><input data-band="amount" type="number" min="0" max="100000" step="1" value="${b.amount}" required aria-label="区分の追加料金"></td><td><button type="button" data-remove-band>削除</button></td></tr>`;}
function extraSettings(){
 if(!canPrices())return '<section class="panel"><h2>施設別追加料金</h2><p>料金変更は管理者、または食事管理の全範囲を許可された職員が行います。</p></section>';
 const p=S.extraPrices.at(-1);
 return `<form id="extraPriceForm" class="panel"><h2>施設別の追加料金設定</h2><p>${esc(S.org.name)}専用です。新しい履歴として保存し、既存の提供済み料金は変更しません。検証用サンプル料金は登録していません。</p><label class="checks"><input name="enabled" type="checkbox" ${p?.enabled?'checked':''}>追加料金を有効にする</label><div class="formgrid two"><label>適用開始日<input name="effective_date" type="date" min="${today()}" max="2100-12-31" value="${today()}" required></label><label>追加料金なしの上限（g）<input name="free_limit" type="number" min="0" max="2000" step="1" required value="${p?.free_limit??''}"></label></div><p>区分の開始・終了は両端を含みます。終了空欄は入力上限の2000gまで。空白の区分を推測して埋めません。有効化には上限まで連続した区分が必要です。</p><div class="tablewrap"><table class="band-table"><thead><tr><th>開始g</th><th>終了g</th><th>追加円</th><th>操作</th></tr></thead><tbody id="extraBands">${(p?.bands||[]).map(bandRow).join('')}</tbody></table></div><button type="button" id="addExtraBand">料金区分を追加</button><div class="formgrid two"><label>白米おかわり1回（円）<input name="rice_refill_price" type="number" min="0" max="100000" step="1" required value="${p?.rice_refill_price??''}"></label><label>みそ汁おかわり1回（円）<input name="soup_refill_price" type="number" min="0" max="100000" step="1" required value="${p?.soup_refill_price??''}"></label></div><p data-price-validation role="status"></p><button type="submit" class="primary">追加料金設定を履歴に保存</button></form><section class="panel"><h3>設定履歴</h3><p>同じ適用日の変更も履歴を残し、提供時に採用した履歴IDを固定します。無効化も新しい適用日で保存してください。</p>${S.extraPrices.slice().reverse().map(p=>`<details><summary>${esc(p.effective_date)}から ／ ${p.enabled?'有効':'無効'} ／ ${new Date(p.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</summary><p>追加なし ${p.free_limit}gまで ／ 白米おかわり ${p.rice_refill_price}円 ／ みそ汁 ${p.soup_refill_price}円</p><ul>${p.bands.map(b=>`<li>${b.from}〜${b.to??2000}g：${b.amount}円</li>`).join('')}</ul><small>設定者ID：${esc(p.created_by)}</small></details>`).join('')||'<p>追加料金設定は未登録です（無効）。</p>'}</section>`;
}
function readPrice(f){return {enabled:f.elements.enabled.checked,free_limit:f.elements.free_limit.value===''?null:Number(f.elements.free_limit.value),rice_refill_price:f.elements.rice_refill_price.value===''?null:Number(f.elements.rice_refill_price.value),soup_refill_price:f.elements.soup_refill_price.value===''?null:Number(f.elements.soup_refill_price.value),bands:[...f.querySelectorAll('#extraBands tr')].map(tr=>Object.fromEntries([...tr.querySelectorAll('[data-band]')].map(i=>[i.dataset.band,i.value===''?null:Number(i.value)])))};}
function billActions(){const b=latestBill();return `<section class="panel"><h2>請求の確定・訂正履歴</h2>${S.bills.some(v=>v.is_final)?`<label>表示する請求版<select id="billVersion"><option value="">現在の集計・最新確定版</option>${S.bills.filter(v=>v.is_final).map(v=>`<option value="${v.id}" ${S.billViewId===v.id?'selected':''}>確定 第${v.version}版（保存時の明細）</option>`).join('')}</select></label>`:''}${S.billViewId?'<p class="warning">過去の確定版を表示しています。現在の料金・氏名で再計算しません。</p>':''}<p>${b?.is_final?'確定済みです。確定時の氏名・明細・単価で出力します。':'未確定の集計です。要確認を解消し、月末を過ぎてから管理者が確定してください。'}</p>${admin()?`<button id="billAction" class="primary">${b?.is_final?'理由を記録して確定を解除':'この月の請求を確定'}</button>`:''}${S.bills.slice().reverse().map(b=>`<details><summary>第${b.version}版 ／ ${b.is_final?'確定':'訂正のため解除'} ／ ${new Date(b.occurred_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</summary><p>${esc(b.reason)}</p><small>操作職員ID：${esc(b.actor)}</small></details>`).join('')}</section>`;}
function bindExtras(){
 document.querySelectorAll('[data-extra]').forEach(f=>{
  const x=entry(f.dataset.extra,f.dataset.date,f.dataset.meal).extra;
  const preview=()=>{const g=f.elements.grams.value===''?null:Number(f.elements.grams.value),a=MealExtras.calculate(x.tariff,g,Number(f.elements.rice.value),Number(f.elements.soup.value));f.querySelector('[data-preview]').textContent=a.state==='needs_review'?'要確認：追加料金はまだ請求できません。':`白米量 ${a.rice_amount}円 ＋ 白米おかわり ${a.rice_refill_amount}円 ＋ みそ汁 ${a.soup_refill_amount}円 ＝ ${a.total}円${a.state==='disabled'?'（料金機能は無効）':''}`;};
  f.oninput=()=>{S.dirty=true;f.dataset.dirty='true';preview();msg('量・おかわりに未保存の入力があります。保存してください。');};
  f.querySelector('[data-copy-rice]').onclick=e=>{f.elements.grams.value=e.target.dataset.copyRice;f.oninput();};
  f.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{const input=f.elements[b.dataset.step];input.value=Math.max(0,Math.min(100,Number(input.value)+Number(b.dataset.delta)));f.oninput();});
  f.onsubmit=e=>{e.preventDefault();const g=f.elements.grams.value===''?null:Number(f.elements.grams.value),rice=Number(f.elements.rice.value),soup=Number(f.elements.soup.value);run(async()=>{
   let reason='';if(f.dataset.date<today()){reason=prompt('過去分を訂正する理由（必須）');if(!reason)return;}
   const r=entry(f.dataset.extra,f.dataset.date,f.dataset.meal);const saved=check(await db.rpc('save_meal_extra',{p_org:S.org.id,p_client:r.client_id,p_date:r.meal_date,p_meal:r.meal,p_revision:x.revision,p_entry_revision:r.revision,p_grams:g,p_rice:rice,p_soup:soup,p_reason:reason}));
   Object.assign(x,saved);f.dataset.dirty='false';S.dirty=!!document.querySelector('[data-extra][data-dirty=true]');
   const amounts=MealExtras.amounts(r),total=amounts.rice+amounts.riceRefill+amounts.soupRefill;
   f.closest('details').querySelector('summary').textContent=(x.state==='needs_review'?'追加料金：要確認':`追加料金 ${total.toLocaleString()}円`)+' ／ おかわり入力';
   f.querySelector('small').textContent='最終入力：'+x.updated_by_name+' ／ '+new Date(x.updated_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
   msg('実提供量・おかわりを保存しました。'+(S.dirty?' ほかの利用者の入力は未保存です。':''));
  });};preview();
 });
 const f=document.getElementById('extraPriceForm');if(f){
  const validate=()=>{const errors=MealExtras.validate(readPrice(f));f.querySelector('[data-price-validation]').textContent=errors.join(' ');return errors;};
  f.addEventListener('input',validate);
  $('addExtraBand').onclick=()=>{$('extraBands').insertAdjacentHTML('beforeend',bandRow());S.dirty=true;f.dataset.dirty='true';validate();};
  $('extraBands').onclick=e=>{if(e.target.matches('[data-remove-band]')){e.target.closest('tr').remove();S.dirty=true;f.dataset.dirty='true';validate();}};
  f.onsubmit=e=>{e.preventDefault();const p=readPrice(f),date=f.elements.effective_date.value;run(async()=>{
   await NexiaPermissions.requireEdit(db,S.members.find(m=>m.organization_id===S.org.id),S.org,S.user.id,'meal_settings',true);
   const errors=validate(),fatal=errors.filter(m=>p.enabled||!m.includes('料金が未設定'));
   if(fatal.length)throw Error(fatal.join(' '));if(!date||date<today()||date>'2100-12-31')throw Error('適用開始日は今日以降にしてください。');
   if(!confirm(`${S.org.name}：${date}から追加料金を${p.enabled?'有効':'無効'}として保存します。設定した料金を確認しましたか？${errors.length?' 未確定の区分があり、有効化できません。':''}`))return;
   check(await db.rpc('save_meal_extra_price',{p_org:S.org.id,p_expected:S.extraPrices.at(-1)?.id||null,p_date:date,p_enabled:p.enabled,p_free:p.free_limit,p_bands:p.bands,p_rice:p.rice_refill_price,p_soup:p.soup_refill_price}));S.dirty=false;await load();msg('追加料金設定を新しい履歴として保存しました。');
  });};
 }
 if($('billVersion'))$('billVersion').onchange=()=>{S.billViewId=$('billVersion').value;render();};
 if($('billAction'))$('billAction').onclick=()=>run(async()=>{const reason=prompt(latestBill()?.is_final?'確定を解除する理由（必須）。過去の確定版は残ります。':'請求内容を確認した記録・理由（必須）');if(!reason)return;check(await db.rpc('meal_bill_action',{p_org:S.org.id,p_month:S.month+'-01',p_expected:latestBill()?.version||0,p_final:!latestBill()?.is_final,p_reason:reason}));await load();msg('請求の確定状態を履歴に保存しました。');});
}
