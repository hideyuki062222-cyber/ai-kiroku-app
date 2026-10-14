(()=>{
  function ready(){return typeof db!=='undefined'&&typeof membership!=='undefined'&&typeof loadEntries==='function'}
  function boot(){
    if(!ready()){setTimeout(boot,120);return}
    window.toggleCarry=async(id,v)=>{
      try{
        const {error}=await db.from('handoff_entries').update({carry_over:v}).eq('id',id).eq('organization_id',membership.organization_id);
        if(error)throw error;await loadEntries();
      }catch(e){console.error(e);alert('申し送りの継続設定を変更できませんでした。再読み込みしてお試しください。')}
    };
    window.toggleResolved=async(id,v)=>{
      try{
        const {error}=await db.from('handoff_entries').update({resolved:v}).eq('id',id).eq('organization_id',membership.organization_id);
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
    const oldSignup=window.signup;
    if(typeof oldSignup==='function'&&!oldSignup.__handoffSafety){
      const wrapped=async function(...a){
        const email=document.getElementById('email')?.value?.trim()||'';
        const password=document.getElementById('password')?.value||'';
        const msg=document.getElementById('authmsg');
        if(!email||password.length<12){if(msg)msg.textContent='メールアドレスと12文字以上のパスワードを入力してください。';return}
        return oldSignup(...a);
      };
      wrapped.__handoffSafety=true;window.signup=wrapped;
    }
    const oldLogout=window.logout;
    if(typeof oldLogout==='function'&&!oldLogout.__handoffSafety){
      const wrapped=async(...a)=>{try{localStorage.removeItem('aiKirokuUsers');localStorage.removeItem('aiKirokuProfiles');localStorage.removeItem('activeOrganizationId')}catch(_e){}return oldLogout(...a)};
      wrapped.__handoffSafety=true;window.logout=wrapped;
    }
  }
  boot();
})();