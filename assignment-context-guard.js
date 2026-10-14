(()=>{
  const params=new URLSearchParams(location.search);
  if(params.get('from')!=='assignment')return;

  const assignmentId=params.get('assignment')||'';
  let guardDisabled=false;
  let generateWrapped=false;
  let timedOut=false;
  let tries=0;

  function q(id){return document.getElementById(id)}
  function trusted(){
    const ctx=window.assignmentContext;
    return !!assignmentId&&!!ctx&&ctx.assignmentId===assignmentId&&!!ctx.client&&!!ctx.clientId&&!!ctx.organizationId;
  }
  function failed(){
    return !assignmentId||window.assignmentContext===null||timedOut;
  }
  function setStatus(text,type='normal'){
    const el=q('recordSaveStatus');
    if(!el)return;
    el.textContent=text;
    el.style.fontWeight='800';
    el.style.color=type==='error'?'#b42318':type==='success'?'#166534':'#8a5a00';
  }
  function setGenerateButtons(disabled){
    document.querySelectorAll('button').forEach(btn=>{
      const text=(btn.textContent||'').trim();
      if(text==='AIで記録作成'||text==='別の文章を作る')btn.disabled=disabled;
    });
  }
  function lock(){
    guardDisabled=true;
    window.__assignmentContextGuardReady=false;
    setGenerateButtons(true);
    const commit=q('recordCommitButton');if(commit)commit.disabled=true;
  }
  function unlock(){
    if(!guardDisabled)return;
    guardDisabled=false;
    window.__assignmentContextGuardReady=true;
    setGenerateButtons(false);
    setStatus('✓ 担当情報をクラウドで確認しました。記録文を作成できます。','success');
  }
  function blockMessage(){
    if(failed())setStatus('担当情報を確認できないため、記録の作成・保存を停止しています。担当割当画面から開き直してください。','error');
    else setStatus('担当情報をクラウドから確認しています。少し待ってください。','warn');
  }
  function wrapGenerate(){
    const original=window.generate;
    if(typeof original!=='function'||!original.__formalSaveWrapped||original.__assignmentContextGuardWrapped)return;
    const wrapped=async function(...args){
      if(!trusted()){
        lock();blockMessage();return;
      }
      return original.apply(this,args);
    };
    wrapped.__formalSaveWrapped=true;
    wrapped.__assignmentContextGuardWrapped=true;
    window.generate=wrapped;
    generateWrapped=true;
  }
  function sync(){
    wrapGenerate();
    if(trusted()){
      unlock();
      return true;
    }
    lock();blockMessage();
    return false;
  }

  // Stop a formal-save click before the handler registered by record-safety.js runs.
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target.closest('#recordCommitButton'):null;
    if(!target||trusted())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    lock();blockMessage();
  },true);

  // Buttons can be inserted after this script starts, so keep newly-created controls locked.
  const observer=new MutationObserver(()=>{
    if(!trusted())lock();
    wrapGenerate();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});

  lock();
  blockMessage();
  const timer=setInterval(()=>{
    tries++;
    const ready=sync();
    if(ready&&generateWrapped){
      clearInterval(timer);
      observer.disconnect();
      return;
    }
    if(tries>=120){
      timedOut=true;
      lock();blockMessage();
      clearInterval(timer);
      observer.disconnect();
    }
  },125);
})();