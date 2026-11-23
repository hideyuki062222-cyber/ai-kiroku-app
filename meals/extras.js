'use strict';
function latestBill(){return S.bills.at(-1);}
function displayedBill(){return S.bills.find(b=>b.id===S.billViewId&&b.is_final)||(latestBill()?.is_final?latestBill():null);}
function billEntries(){return displayedBill()?.entries||S.entries;}
function billClients(){return displayedBill()?.clients||S.clients;}
function extraColumns(t){return ['baseAmount','riceAmount','riceRefillAmount','soupRefillAmount','extraAmount'].map(k=>`<td class="money">${(t[k]||0).toLocaleString()}円</td>`).join('');}
function extraSummary(r){
 const a=MealExtras.amounts(r),sum=a.rice+a.riceRefill+a.soupRefill;
 if(r.extra.state==='needs_review')return '白米量を確認 · 追加料金は未計上';
 return `追加料金 ${sum.toLocaleString()}円 ／ 白米量・おかわり`;
}
function canConfirmExtra(d){return !latestBill()?.is_final&&(d>=today()||admin());}
function extraForm(r,confirming=false){
 const x=r.extra,editable=canConfirmExtra(r.meal_date);
 const riceShortcut=editable&&x.actual_rice===null&&Number.isInteger(r.rice_grams)
  ?`<button type="button" data-confirm-rice="${r.rice_grams}">設定どおり（${r.rice_grams}g）で確定</button>`:'';
 const refills=[['rice','白米',x.rice_refills],['soup','みそ汁',x.soup_refills]].map(([key,label,count])=>
  `<label>${label}のおかわり回数<div class="refill-stepper"><button type="button" data-step="${key}" data-delta="-1" aria-label="${label}のおかわりを減らす">−</button><input name="${key}" type="number" min="0" max="100" step="1" value="${count}" required><button type="button" data-step="${key}" data-delta="1" aria-label="${label}のおかわりを増やす">＋</button></div></label>`).join('');
 return `<form data-extra="${r.client_id}" data-date="${r.meal_date}" data-meal="${r.meal}">
  <fieldset ${editable?'':'disabled'}>
   <label>今回の白米量（g・おかわりを除く）<input name="grams" type="number" inputmode="numeric" min="0" max="2000" step="1" value="${x.actual_rice??''}" placeholder="未確認" ${confirming?'required':''}></label>
   ${riceShortcut}${refills}
   <p data-preview role="status"></p>
   <button class="primary" type="submit">白米量・追加料金を確定</button>
  </fieldset>
  <small data-extra-stamp>最終入力：${esc(x.updated_by_name)} ／ ${new Date(x.updated_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</small>
  ${r.meal_date<today()&&!admin()?'<p>過去日の訂正は管理者が理由を記録して行います。</p>':''}</form>`;
}
function extraControl(id,d,m){
 const r=entry(id,d,m);if(r?.status!=='served')return '';
 if(!r.extra)return '<small>導入前の提供記録：追加料金対象外</small>';
 return `<details class="extra-control"><summary>${extraSummary(r)}</summary>${extraForm(r)}</details>`;
}
function openExtraConfirmation(r){
 const dialog=document.createElement('dialog');
 dialog.className='extra-control extra-confirmation';
 dialog.setAttribute('aria-labelledby','extraConfirmationTitle');
 dialog.innerHTML=`<h2 id="extraConfirmationTitle">今回の白米量を確認</h2>
  <p>${esc(name(person(r.client_id)))} ／ ${r.meal_date} ${C.labels[r.meal]}</p>
  <p>食べた量を確認してから確定してください。登録済みの料金区分で追加額を計算します。</p>
  ${extraForm(r,true)}<button type="button" data-confirm-later>あとで確認</button>`;
 $('view').append(dialog);
 dialog.querySelector('[data-confirm-later]').onclick=()=>dialog.close();
 dialog.addEventListener('cancel',e=>{if(S.busy)e.preventDefault();});
 dialog.addEventListener('close',()=>{
  dialog.remove();
  S.dirty=!!document.querySelector('#view form[data-dirty="true"]');
  if(!saved)msg('提供済みを保存しました。白米量が未確認のため、追加料金は要確認です。');
 });
 let saved=false;
 bindExtraForm(dialog.querySelector('form'),()=>{
  saved=true;
  dialog.close();
  render();
 });
 dialog.showModal();
}
function bandRow(b={from:'',to:'',amount:''}){return `<tr><td><input data-band="from" type="number" min="0" max="2000" step="1" value="${b.from}" required aria-label="開始グラム"></td><td><input data-band="to" type="number" min="0" max="2000" step="1" value="${b.to??''}" placeholder="上限なし" aria-label="終了グラム（空欄は2000gまで）"></td><td><input data-band="amount" type="number" min="0" max="100000" step="1" value="${b.amount}" required aria-label="区分の追加料金"></td><td><button type="button" data-remove-band>削除</button></td></tr>`;}
function extraSettings(){
 if(!canPrices())return '<section class="panel"><h2>施設別追加料金</h2><p>料金変更は管理者、または食事管理の全範囲を許可された職員が行います。</p></section>';
 const p=S.extraPrices.at(-1);
 return `<form id="extraPriceForm" class="panel"><h2>施設別の追加料金設定</h2><p>${esc(S.org.name)}専用です。新しい履歴として保存し、既存の提供済み料金は変更しません。検証用サンプル料金は登録していません。</p><label class="checks"><input name="enabled" type="checkbox" ${p?.enabled?'checked':''}>追加料金を有効にする</label><div class="formgrid two"><label>適用開始日<input name="effective_date" type="date" min="${today()}" max="2100-12-31" value="${today()}" required></label><label>追加料金なしの上限（g）<input name="free_limit" type="number" min="0" max="2000" step="1" required value="${p?.free_limit??''}"></label></div><p>区分の開始・終了は両端を含みます。終了空欄は入力上限の2000gまで。空白の区分を推測して埋めません。有効化には上限まで連続した区分が必要です。</p><div class="tablewrap"><table class="band-table"><thead><tr><th>開始g</th><th>終了g</th><th>追加円</th><th>操作</th></tr></thead><tbody id="extraBands">${(p?.bands||[]).map(bandRow).join('')}</tbody></table></div><button type="button" id="addExtraBand">料金区分を追加</button><div class="formgrid two"><label>白米おかわり1回（円）<input name="rice_refill_price" type="number" min="0" max="100000" step="1" required value="${p?.rice_refill_price??''}"></label><label>みそ汁おかわり1回（円）<input name="soup_refill_price" type="number" min="0" max="100000" step="1" required value="${p?.soup_refill_price??''}"></label></div><p data-price-validation role="status"></p><button type="submit" class="primary">追加料金設定を履歴に保存</button></form><section class="panel"><h3>設定履歴</h3><p>同じ適用日の変更も履歴を残し、提供時に採用した履歴IDを固定します。無効化も新しい適用日で保存してください。</p>${S.extraPrices.slice().reverse().map(p=>`<details><summary>${esc(p.effective_date)}から ／ ${p.enabled?'有効':'無効'} ／ ${new Date(p.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</summary><p>追加なし ${p.free_limit}gまで ／ 白米おかわり ${p.rice_refill_price}円 ／ みそ汁 ${p.soup_refill_price}円</p><ul>${p.bands.map(b=>`<li>${b.from}〜${b.to??2000}g：${b.amount}円</li>`).join('')}</ul><small>設定者ID：${esc(p.created_by)}</small></details>`).join('')||'<p>追加料金設定は未登録です（無効）。</p>'}</section>`;
}
function readPrice(f){return {enabled:f.elements.enabled.checked,free_limit:f.elements.free_limit.value===''?null:Number(f.elements.free_limit.value),rice_refill_price:f.elements.rice_refill_price.value===''?null:Number(f.elements.rice_refill_price.value),soup_refill_price:f.elements.soup_refill_price.value===''?null:Number(f.elements.soup_refill_price.value),bands:[...f.querySelectorAll('#extraBands tr')].map(tr=>Object.fromEntries([...tr.querySelectorAll('[data-band]')].map(i=>[i.dataset.band,i.value===''?null:Number(i.value)])))};}
function billActions(){const b=latestBill();return `<section class="panel"><h2>請求の確定・訂正履歴</h2>${S.bills.some(v=>v.is_final)?`<label>表示する請求版<select id="billVersion"><option value="">現在の集計・最新確定版</option>${S.bills.filter(v=>v.is_final).map(v=>`<option value="${v.id}" ${S.billViewId===v.id?'selected':''}>確定 第${v.version}版（保存時の明細）</option>`).join('')}</select></label>`:''}${S.billViewId?'<p class="warning">過去の確定版を表示しています。現在の料金・氏名で再計算しません。</p>':''}<p>${b?.is_final?'確定済みです。確定時の氏名・明細・単価で出力します。':'未確定の集計です。要確認を解消し、月末を過ぎてから管理者が確定してください。'}</p>${admin()?`<button id="billAction" class="primary">${b?.is_final?'理由を記録して確定を解除':'この月の請求を確定'}</button>`:''}${S.bills.slice().reverse().map(b=>`<details><summary>第${b.version}版 ／ ${b.is_final?'確定':'訂正のため解除'} ／ ${new Date(b.occurred_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</summary><p>${esc(b.reason)}</p><small>操作職員ID：${esc(b.actor)}</small></details>`).join('')}</section>`;}
function bindExtraForm(f,onSaved){
 const r=entry(f.dataset.extra,f.dataset.date,f.dataset.meal),x=r.extra;
 const grams=()=>f.elements.grams.value===''?null:Number(f.elements.grams.value);
 const shortcut=f.querySelector('[data-confirm-rice]');
 const preview=()=>{
  const a=MealExtras.calculate(x.tariff,grams(),Number(f.elements.rice.value),Number(f.elements.soup.value));
  if(shortcut)shortcut.hidden=grams()!==null&&grams()!==Number(shortcut.dataset.confirmRice);
  f.querySelector('[data-preview]').textContent=a.state==='needs_review'
   ?'白米量が未確認か、料金区分が未設定です。追加料金は要確認になります。'
   :`白米量 ${a.rice_amount}円 ＋ 白米おかわり ${a.rice_refill_amount}円 ＋ みそ汁 ${a.soup_refill_amount}円 ＝ ${a.total}円${a.state==='disabled'?'（料金機能は無効）':''}`;
 };
 f.oninput=()=>{
  S.dirty=true;f.dataset.dirty='true';preview();
  msg('白米量・おかわりに未保存の入力があります。');
 };
 if(shortcut)shortcut.onclick=()=>{
  f.elements.grams.value=shortcut.dataset.confirmRice;f.oninput();f.requestSubmit();
 };
 f.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{
  const input=f.elements[b.dataset.step];
  input.value=Math.max(0,Math.min(100,Number(input.value)+Number(b.dataset.delta)));f.oninput();
 });
 f.onsubmit=e=>{
  e.preventDefault();
  const g=grams(),rice=Number(f.elements.rice.value),soup=Number(f.elements.soup.value);
  run(async()=>{
   let reason='';
   if(f.dataset.date<today()){reason=prompt('過去分を訂正する理由（必須）');if(!reason)return;}
   const saved=check(await db.rpc('save_meal_extra',{p_org:S.org.id,p_client:r.client_id,p_date:r.meal_date,p_meal:r.meal,p_revision:x.revision,p_entry_revision:r.revision,p_grams:g,p_rice:rice,p_soup:soup,p_reason:reason}));
   Object.assign(x,saved);
   f.dataset.dirty='false';
   S.dirty=!!document.querySelector('#view form[data-dirty="true"]');
   const summary=f.closest('details')?.querySelector('summary');
   if(summary)summary.textContent=extraSummary(r);
   if(shortcut&&x.actual_rice!==null)shortcut.remove();
   f.querySelector('[data-extra-stamp]').textContent='最終入力：'+x.updated_by_name+' ／ '+new Date(x.updated_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
   onSaved?.();
   const a=MealExtras.amounts(r),total=a.rice+a.riceRefill+a.soupRefill;
   msg((x.state==='needs_review'?'白米量・おかわりを保存しました。追加料金は要確認です。':`白米量・おかわりを保存しました。追加料金 ${total.toLocaleString()}円を集計に反映しました。`)+(S.dirty?' ほかの入力は未保存です。':''));
  });
 };
 preview();
}
function bindExtras(){
 document.querySelectorAll('[data-extra]').forEach(f=>bindExtraForm(f));
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
