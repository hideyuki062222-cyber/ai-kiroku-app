(()=>{
  function ready(){return typeof db!=='undefined'&&typeof membership!=='undefined'&&typeof loadEntries==='function'}
  function boot(){
    if(!ready()){setTimeout(boot,120);return}
    window.toggleCarry=async(id,v)=>{
      try{
        const {error}=await db.from('handoff_entries').update({carry_over:v,updated_at:new Date().toISOString()}).eq('id',id).eq('organization_id',membership.organization_id);
        if(error)throw error;await loadEntries();
      }catch(e){console.error(e);alert('申し送りの継続設定を変更できませんでした。再読み込みしてお試しください。')}
    };
    window.toggleResolved=async(id,v)=>{
      try{
        const {error}=await db.from('handoff_entries').update({resolved:v,updated_at:new Date().toISOString()}).eq('id',id).eq('organization_id',membership.organization_id);
        if(error)throw error;await loadEntries();
      }catch(e){console.error(e);alert('申し送りの対応状態を変更できませんでした。再読み込みしてお試しください。')}
    };
    const originalDelete=window.deleteEntry;
    if(typeof originalDelete==='function'){
      window.deleteEntry=async id=>{
        if(!confirm('この申し送りを削除しますか？'))return;
        const {error}=await db.from('handoff_entries').delete().eq('id',id).eq('organization_id',membership.organization_id);
        if(error){alert('削除できませんでした: '+error.message);return}await loadEntries();
      };
    }
    const oldLogout=window.logout;
    if(typeof oldLogout==='function'&&!oldLogout.__handoffSafety){
      const wrapped=async(...a)=>{try{localStorage.removeItem('aiKirokuUsers');localStorage.removeItem('aiKirokuProfiles');localStorage.removeItem('activeOrganizationId')}catch(_e){}return oldLogout(...a)};
      wrapped.__handoffSafety=true;window.logout=wrapped;
    }
  }
  boot();
})();