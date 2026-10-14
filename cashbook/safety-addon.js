(()=>{
  function wait(){
    if(typeof window.saveEntry!=='function'||typeof window.saveEdit!=='function'||typeof window.changeClient!=='function'){setTimeout(wait,120);return}
    boot();
  }
  function boot(){
    const clientSelect=document.getElementById('clientSelect');
    const originalSave=window.saveEntry;
    if(!originalSave.__cashSafety){
      const wrapped=async function(...args){
        if(wrapped.busy)return;
        wrapped.busy=true;
        const selectedAtStart=typeof selectedClientId!=='undefined'?selectedClientId:null;
        if(clientSelect)clientSelect.disabled=true;
        try{
          const out=await originalSave.apply(this,args);
          if(selectedAtStart!==null&&typeof selectedClientId!=='undefined'&&selectedClientId!==selectedAtStart){
            console.warn('client changed during cashbook save; forcing reload');
            location.reload();
          }
          return out;
        }finally{wrapped.busy=false;if(clientSelect)clientSelect.disabled=false}
      };
      wrapped.__cashSafety=true;window.saveEntry=wrapped;
    }

    const originalEdit=window.saveEdit;
    if(!originalEdit.__cashSafety){
      const wrapped=async function(...args){
        const st=document.getElementById('editStatus');
        const store=document.getElementById('editStore')?.value?.trim()||'';
        if(!store){if(st)st.textContent='店名・支払先を入力してください。';return}
        const row=(typeof entries!=='undefined'&&typeof editingId!=='undefined')?entries.find(e=>e.id===editingId):null;
        if(row&&typeof selectedClientId!=='undefined'&&row.client_id!==selectedClientId){if(st)st.textContent='利用者が切り替わっています。編集画面を閉じてやり直してください。';return}
        return originalEdit.apply(this,args);
      };
      wrapped.__cashSafety=true;window.saveEdit=wrapped;
    }

    const originalChange=window.changeClient;
    if(!originalChange.__cashSafety){
      const wrapped=async function(id,...args){
        try{if(typeof closeEdit==='function')closeEdit()}catch(_e){}
        return originalChange.call(this,id,...args);
      };
      wrapped.__cashSafety=true;window.changeClient=wrapped;
    }

    const originalDelete=window.deleteEntry;
    if(typeof originalDelete==='function'&&!originalDelete.__cashSafety){
      const wrapped=async id=>{
        const row=(typeof entries!=='undefined')?entries.find(e=>e.id===id):null;
        if(!row||row.client_id!==selectedClientId)return alert('削除対象を確認できません。再読み込みしてください。');
        if(!confirm('この記録を削除しますか？'))return;
        const {error}=await db.from('cashbook_entries').delete().eq('id',id).eq('organization_id',membership.organization_id).eq('client_id',selectedClientId);
        if(error){alert('削除できませんでした: '+error.message);return}await reloadAll();
      };
      wrapped.__cashSafety=true;window.deleteEntry=wrapped;
    }

    const originalSignup=window.signup;
    if(typeof originalSignup==='function'&&!originalSignup.__cashSafety){
      const wrapped=async function(...args){
        const email=document.getElementById('email')?.value?.trim()||'',password=document.getElementById('password')?.value||'',msg=document.getElementById('authMsg');
        if(!email||password.length<12){if(msg)msg.textContent='メールアドレスと12文字以上のパスワードを入力してください。';return}
        return originalSignup.apply(this,args);
      };
      wrapped.__cashSafety=true;window.signup=wrapped;
    }
  }
  wait();
})();