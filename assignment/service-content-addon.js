(()=>{
 const choices=['起床介助','就寝介助','トイレ介助','食事介助','入浴準備','入浴介助','更衣介助','服薬介助・確認','口腔ケア','清容・保清','移動介助','買い物・外出支援','通院等介助','家事援助','その他'];
 function decorate(){
  if(membership?.role!=='admin')return;
  document.querySelectorAll('[data-times]').forEach(input=>{
   const box=input.closest('.settings-client');if(!box||box.querySelector('.service-presets'))return;
   const panel=document.createElement('div');panel.className='service-presets';
   const title=document.createElement('p');title.textContent='時間ごとのサービス内容（AI記録に引き継ぎ）';panel.append(title);
   slots.filter(s=>s.client_id===input.dataset.times&&s.is_active).sort((a,b)=>minute(a.service_time)-minute(b.service_time)).forEach(slot=>{
    const button=document.createElement('button');button.type='button';button.className='secondary';button.style.cssText='display:block;width:100%;text-align:left;margin:8px 0;white-space:normal;line-height:1.6';
    button.textContent=fmtTime(slot.service_time)+'　'+(slot.service_contents===null||slot.service_contents===undefined?'未設定':slot.service_contents.join('・')||'選択なし');button.onclick=()=>edit(slot);panel.append(button);
   });box.append(panel);
  });
 }
 function edit(slot){
  if(membership?.role!=='admin')return;
  document.getElementById('servicePresetDialog')?.remove();
  const dialog=document.createElement('dialog');dialog.id='servicePresetDialog';dialog.style.cssText='width:min(520px,90vw);max-height:85vh;overflow:auto;border:0;border-radius:16px;padding:20px';
  const title=document.createElement('h2');title.textContent=clientLabel(clients.find(c=>c.id===slot.client_id))+' '+fmtTime(slot.service_time);dialog.append(title);
  const note=document.createElement('p');note.textContent='サービス内容（複数選択可）。AI記録を開いたときに選択されます。当日の支援に合わせて変更できます。';dialog.append(note);
  const fields=document.createElement('div');fields.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px';dialog.append(fields);
  choices.forEach(value=>{const label=document.createElement('label');label.style.cssText='display:flex;align-items:center;gap:8px;padding:10px;background:#f5f7fb;border-radius:8px;margin:0';const cb=document.createElement('input');cb.type='checkbox';cb.value=value;cb.checked=(slot.service_contents||[]).includes(value);cb.style.cssText='width:20px;height:20px;flex-shrink:0';label.append(cb,document.createTextNode(value));fields.append(label);});
  const status=document.createElement('p');status.setAttribute('role','status');dialog.append(status);
  const save=document.createElement('button');save.textContent='サービス内容を保存';save.className='primary';const cancel=document.createElement('button');cancel.textContent='閉じる';cancel.style.marginLeft='8px';cancel.onclick=()=>{dialog.close();dialog.remove();};dialog.append(save,cancel);
  save.onclick=async()=>{
   save.disabled=true;status.textContent='保存中…';
   try{
    const values=[...fields.querySelectorAll('input:checked')].map(x=>x.value);
    let query=sb.from('client_service_slots').update({service_contents:values}).eq('id',slot.id).eq('organization_id',organization.id);
    query=slot.service_contents==null?query.is('service_contents',null):query.eq('service_contents',JSON.stringify(slot.service_contents));
    const {data,error}=await query.select('id');if(error)throw error;if(data?.length!==1)throw Error('別の端末で変更されたか、保存権限がありません。閉じて最新情報に更新してください。');
    slot.service_contents=values;status.textContent='保存しました。';await loadAll();dialog.close();dialog.remove();
   }catch(e){status.textContent='保存できませんでした：'+e.message;}finally{save.disabled=false;}
  };
  document.body.append(dialog);dialog.showModal();
 }
 function boot(){if(typeof window.renderClientSettings!=='function'){setTimeout(boot,120);return;}const original=window.renderClientSettings;window.renderClientSettings=function(...args){const r=original.apply(this,args);decorate();return r;};decorate();}
 boot();
})();
