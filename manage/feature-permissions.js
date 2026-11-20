/* Admin-only feature selector. A facility/user/revision snapshot accompanies every save. */
(()=>{
 'use strict';
 const P=NexiaPermissions;let opened=null,busy=false,ready=false;
 const dialog=document.createElement('dialog');dialog.id='permissionDialog';dialog.className='permission-dialog';dialog.innerHTML='<h2>権限を設定</h2><p id="permissionTarget"></p><p>チェックは通常業務に追加する権限です。「すべて選択」でも管理者にはなりません。従来の出力はチェックなしでも利用できます。「すべて選択」でも従来範囲は自動拡張しません。</p><div class="row"><button class="btn" id="permissionsAll">すべて選択</button><button class="btn" id="permissionsNone">すべて解除</button></div><fieldset id="permissionsFields"></fieldset><h3>変更前後の差分</h3><div id="permissionsDiff" class="permission-diff"></div><p id="permissionsStatus" class="permission-status" role="status" aria-live="polite"></p><div class="row"><button class="btn primary" id="permissionsSave">変更内容を確認して保存</button><button class="btn" id="permissionsClose">閉じる</button></div>';
 document.body.append(dialog);const q=id=>document.getElementById(id);
 const title=(key,scope)=>P.definitions.find(d=>d.key===key)?.label+(scope==='legacy'?'（従来範囲）':scope==='full'?'（全範囲）':'（追加権限なし）');
 function selected(){return Object.fromEntries([...dialog.querySelectorAll('[data-feature]:checked')].map(c=>[c.dataset.feature,c.dataset.scope]));}
 function dirty(){return ready&&JSON.stringify(selected())!==JSON.stringify(opened.before);}
 function diffs(){const next=selected();return P.features.filter(k=>next[k]!==opened.before[k]).map(k=>title(k,opened.before[k])+' → '+title(k,next[k]));}
 function renderFields(before){q('permissionsFields').innerHTML=P.definitions.map(d=>'<label class="feature-choice"><input type="checkbox" data-feature="'+d.key+'" data-scope="'+(before[d.key]||'full')+'" '+(before[d.key]?'checked':'')+'><span>'+esc(d.label)+'<small>'+esc(d.description)+'</small>'+(before[d.key]==='legacy'?'<small class="legacy-scope">現在は従来範囲：'+esc(d.legacy)+'。チェックの付け直しだけでは拡張しません。</small>':'')+'</span>'+(before[d.key]==='legacy'&&d.key!=='assignment_settings'?'<button type="button" class="btn permission-upgrade" data-upgrade="'+d.key+'">この機能を全範囲へ拡張</button>':'')+'</label>').join('');}
 function drawDiff(){if(!ready)return;q('permissionsDiff').textContent=diffs().join(' ／ ')||'変更はありません。';q('permissionsSave').disabled=busy||!dirty();}
 function close(){if(busy)return;if(dirty()&&!confirm('未保存の権限変更を破棄しますか？'))return;dialog.close();opened=null;ready=false;}
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});q('permissionsClose').onclick=close;
 for(const [id,on]of [['permissionsAll',true],['permissionsNone',false]])q(id).onclick=()=>{dialog.querySelectorAll('[data-feature]').forEach(c=>{c.checked=on;});drawDiff();};
 dialog.addEventListener('change',drawDiff);
 dialog.addEventListener('click',e=>{const key=e.target.dataset.upgrade;if(!key)return;e.preventDefault();const c=dialog.querySelector('[data-feature="'+key+'"]');if(!confirm(title(key,'legacy')+'から全範囲へ拡張します。プロフィール編集・料金変更など、説明にある追加操作を許可しますか？'))return;c.dataset.scope='full';c.checked=true;e.target.remove();c.closest('label').querySelector('.legacy-scope')?.remove();drawDiff();});
 window.openFeaturePermissions=async(user,name)=>{
  if(activeMembership?.role!=='admin'||user===session.user.id)return;
  if(dialog.open){close();if(dialog.open)return;}
  q('permissionsStatus').classList.remove('permission-error');ready=false;opened={org:activeOrg.id,user,name,before:{},revision:0};const context=opened;
  q('permissionTarget').textContent=activeOrg.name+' ／ '+name;q('permissionsFields').replaceChildren();q('permissionsDiff').textContent='';q('permissionsStatus').textContent='現在の権限を読み込んでいます…';q('permissionsSave').disabled=true;q('permissionsAll').disabled=q('permissionsNone').disabled=true;dialog.showModal();
  try{
   const {data,error}=await db.rpc('get_facility_permission_set',{p_org:context.org,p_user:user});
   if(opened!==context||activeOrg.id!==context.org)return;if(error)throw Error(error.message);
   if(data?.organization_id!==context.org||data.user_id!==user||!Number.isSafeInteger(data.revision)||data.revision<0||!data.permissions||Array.isArray(data.permissions))throw Error('権限の版を確認できません。');
   const before=P.parse(Object.entries(data.permissions).map(([feature,scope])=>({organization_id:context.org,user_id:user,feature,scope})),context.org,user);context.before=Object.fromEntries(P.features.filter(k=>before[k]).map(k=>[k,before[k]]));context.revision=data.revision;
   renderFields(before);
   ready=true;q('permissionsAll').disabled=q('permissionsNone').disabled=false;q('permissionsStatus').textContent='現在の権限を表示しています。';drawDiff();
  }catch(e){if(opened===context){q('permissionsStatus').textContent='読み込めませんでした。設定は変更していません。閉じて再試行してください：'+e.message;q('permissionsStatus').classList.add('permission-error');}}
 };
 q('permissionsSave').onclick=async()=>{
  if(!ready||busy||!dirty())return;const context=opened,next=selected();
  if(activeOrg.id!==context.org||activeMembership.role!=='admin')return;
  if(!confirm(q('permissionTarget').textContent+'\n'+diffs().join('\n')+'\nこの内容で保存しますか？'))return;
  busy=true;dialog.querySelectorAll('button,input').forEach(e=>e.disabled=true);q('permissionsStatus').textContent='保存中…';
  try{
   const changes=Object.fromEntries(P.features.filter(k=>next[k]!==context.before[k]).map(k=>[k,next[k]||null]));
   const {data,error}=await db.rpc('set_facility_permissions',{p_org:context.org,p_user:context.user,p_revision:context.revision,p_changes:changes});if(error)throw Error(error.message);
   if(data?.organization_id!==context.org||data.user_id!==context.user||data.revision!==context.revision+1||JSON.stringify(Object.fromEntries(P.features.filter(k=>data.permissions?.[k]).map(k=>[k,data.permissions[k]])))!==JSON.stringify(next))throw Error('保存結果が一致しません。閉じて最新の権限を確認してください。');
   context.before={...next};context.revision=data.revision;renderFields(context.before);q('permissionsStatus').textContent='権限を保存しました。次の編集操作から反映されます。';await loadStaff();
  }catch(e){q('permissionsStatus').textContent='保存できませんでした。入力は残っています。競合時は閉じて最新の設定を読み直してください：'+e.message;}
  finally{busy=false;dialog.querySelectorAll('button,input').forEach(e=>e.disabled=false);drawDiff();}
 };
 window.addEventListener('beforeunload',e=>{if(busy||dirty()){e.preventDefault();e.returnValue='';}});
 document.addEventListener('click',e=>{if(e.target.closest('a[href]')&&dialog.open&&(busy||dirty())){e.preventDefault();close();}});
 const oldSwitch=window.switchOrg;window.switchOrg=async id=>{if(dialog.open){close();if(dialog.open){q('orgSwitch').value=activeOrg.id;return;}}return oldSwitch(id);};
})();
