/* Only delegated corrections expand; ordinary owner/admin operations retain their paths. */
(()=>{
 function boot(){if(typeof window.renderHistory!=='function'||typeof window.saveEdit!=='function'){setTimeout(boot,100);return;}
  const render=window.renderHistory;window.renderHistory=function(...args){const result=render(...args);if(membership?.role!=='admin')document.querySelectorAll('[onclick^="deleteEntry"]').forEach(b=>{const id=b.getAttribute('onclick').match(/['"]([^'"]+)/)?.[1],row=entries.find(e=>e.id===id);if(row?.created_by!==session.user.id)b.remove();});return result;};
  const save=window.saveEdit;window.saveEdit=async function(...args){const row=entries.find(e=>e.id===editingId);if(!row||row.created_by===session.user.id||membership.role==='admin')return save(...args);
   const st=document.getElementById('editStatus');try{
    await NexiaPermissions.requireEdit(db,membership,organization,session.user.id,'cashbook_management',true);
    const orgId=organization.id,client=selectedClientId,id=editingId,field=n=>document.getElementById(n).value.trim(),amount=Number(field('editAmount')),tx_date=field('editDate'),item=field('editItem'),store=field('editStore'),memo=field('editMemo');
    if(row.client_id!==client||!Number.isSafeInteger(amount)||amount<=0||!tx_date||!item||!store)throw Error('利用者・日付・金額・品名・店名を確認してください。');
    const {data,error}=await db.from('cashbook_entries').update({amount,tx_date,item,store,memo,kind:editKind,updated_by:session.user.id}).eq('organization_id',orgId).eq('client_id',client).eq('id',id).eq('updated_at',row.updated_at).select('id');
    if(error)throw error;if(data?.length!==1)throw Error('ほかの職員が変更しました。閉じて再読み込みしてください。');closeEdit();await reloadAll();
   }catch(e){st.textContent='修正できませんでした：'+e.message;}
  };
 }
 boot();
})();
