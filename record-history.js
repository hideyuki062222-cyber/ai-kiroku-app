(()=>{
 let serial=0;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const savedTime=value=>new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
 window.renderClientRecordHistory=async(db,member)=>{
  const host=document.getElementById('history');if(!host)return;
  const token=++serial,previous=host.querySelector('select')?.value,oldOrg=host.dataset.org;
  host.replaceChildren();if(!member)return;host.dataset.org=member.organization_id;
  const label=el('label','利用者を選択');label.htmlFor='recordHistoryClient';const select=el('select');select.id='recordHistoryClient';
  const status=el('p','利用者を読み込んでいます…');status.setAttribute('role','status');
  const list=el('div'),more=el('button','さらに50件を表示'),refresh=el('button','記録を更新');more.type=refresh.type='button';more.hidden=true;
  const hint=el('p','日付・時間を押すと記録が開きます。担当割当から作成した記録はサービス日時、それ以外は保存日時を表示します。');hint.className='notice';
  host.append(label,select,hint,refresh,status,list,more);let request=0,offset=0;
  const current=()=>token===serial&&host.isConnected;
  async function load(append=false){
   const seq=++request,id=select.value;if(!append){offset=0;list.replaceChildren();}more.hidden=true;
   if(!id){status.textContent='利用者を選択してください。';return;}
   status.textContent='記録を読み込んでいます…';
   try{
    const {data,error}=await db.from('care_records').select('id,created_at,service_date,service_time,service_type,visit_note,care_note,services').eq('organization_id',member.organization_id).eq('client_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+49);
    if(!current()||seq!==request)return;if(error)throw error;
    for(const row of data||[]){
     const detail=el('details');detail.className='history-item';const summary=el('summary');summary.style.cssText='cursor:pointer;padding:14px 4px;font-weight:700;line-height:1.7';
     summary.textContent=(row.service_date?row.service_date+' '+(row.service_time||'').slice(0,5):savedTime(row.created_at)+'（保存日時）')+(row.service_type?' ／ '+row.service_type:'');detail.append(summary);
     for(const [title,value]of [['訪問時の状態・様子・体調',row.visit_note],['支援中・介護者が実施したこと',row.care_note]]){detail.append(el('h3',title));const p=el('p',value||'記載なし');p.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8';detail.append(p);}
     detail.append(el('p','保存日時：'+savedTime(row.created_at)));list.append(detail);
    }
    offset+=(data||[]).length;status.textContent=offset?offset+'件を表示（保存日時が新しい順）':'この利用者の保存済み記録はありません。';more.hidden=(data||[]).length<50;
   }catch(e){if(current()&&seq===request){status.textContent='読み込めませんでした。「記録を更新」で再試行してください。';more.hidden=true;}}
  }
  select.onchange=()=>load();refresh.onclick=()=>load();more.onclick=()=>load(true);
  try{
   const {data,error}=await db.from('clients').select('id,code,display_name,is_active').eq('organization_id',member.organization_id).order('code');
   if(!current())return;if(error)throw error;select.append(new Option('利用者を選択',''));
   for(const c of data||[])select.append(new Option(c.code+(c.display_name?' '+c.display_name:'')+(c.is_active?'':'（利用終了）'),c.id));
   const chosen=oldOrg===member.organization_id&&data?.some(c=>c.id===previous)?previous:data?.find(c=>c.code===document.getElementById('user')?.value)?.id;
   select.value=chosen||'';await load();
  }catch(e){if(current())status.textContent='利用者を読み込めませんでした。画面を再読み込みしてください。';}
 };
})();
