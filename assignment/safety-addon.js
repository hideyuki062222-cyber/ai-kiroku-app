(()=>{
  function wait(){
    if(typeof window.goAI!=='function'||!document.getElementById('saveSelectedBtn')||!document.getElementById('saveEditBtn')){setTimeout(wait,120);return}
    boot();
  }
  function boot(){
    window.goAI=function(a){
      if(!a?.id)return alert('担当情報を確認できません。最新情報に更新してください。');
      const qs=new URLSearchParams({from:'assignment',assignment:a.id});
      location.href='../?'+qs.toString();
    };

    const wrapButton=(id,label)=>{
      const btn=document.getElementById(id);if(!btn||btn.dataset.safetyWrapped==='1')return;
      const original=btn.onclick;if(typeof original!=='function')return;
      btn.dataset.safetyWrapped='1';
      btn.onclick=async function(...args){
        if(btn.dataset.saving==='1')return;
        btn.dataset.saving='1';btn.disabled=true;
        const old=btn.textContent;if(label)btn.textContent=label;
        try{return await original.apply(this,args)}finally{btn.dataset.saving='0';btn.disabled=false;btn.textContent=old}
      };
    };
    wrapButton('saveSelectedBtn','登録中…');
    wrapButton('saveEditBtn','保存中…');
    wrapButton('deleteEditBtn','削除中…');

    const note=document.createElement('div');
    note.className='notice';note.id='assignmentSafetyNote';
    note.style.cssText='margin-top:8px;padding:8px 10px;border-radius:9px;background:#f0fdf4;color:#166534;font-weight:700';
    note.textContent='AI記録へ移動するときは担当IDだけを渡し、利用者・担当者・メモはクラウドから再確認します。';
    const actions=document.getElementById('reloadBtn')?.parentElement;if(actions&&!document.getElementById('assignmentSafetyNote'))actions.after(note);
  }
  wait();
})();