(()=>{
  const CACHE_KEYS=['aiKirokuUsers','aiKirokuProfiles'];
  let pendingRecord=null;
  let pendingHistoryArgs=null;
  let pendingSignature='';
  let generationBusy=false;
  let saveBusy=false;
  let safetyDb=null;
  let originalGenerate=null;
  let originalSave=null;
  let originalAddHistory=null;
  let comparison=null;

  function q(id){return document.getElementById(id)}
  function removeSensitiveCache(){try{CACHE_KEYS.forEach(k=>localStorage.removeItem(k))}catch(_e){}}
  function normalize(s){
    const t=String(s||'').trim();
    if(!t)return '';
    return /[。！？]$/.test(t)?t:t+'。';
  }
  function ensureSafetyNotice(){
    if(q('recordSafetyNotice'))return;
    const input=q('input');
    const card=input?.closest('.card');
    if(!card)return;
    const n=document.createElement('div');
    n.id='recordSafetyNotice';n.className='notice';
    n.style.cssText='margin-top:10px;padding:10px 12px;border-radius:10px;background:#fff8e6;color:#7a5200;font-weight:700';
    n.textContent='記録文はプレビューです。実際に確認・実施した内容と一致しているか確認してから「この内容を正式保存」を押してください。';
    card.appendChild(n);
  }
  function ensureSaveUi(){
    let btn=q('recordCommitButton');
    if(btn)return btn;
    const count=q('careResultCount');
    if(!count)return null;
    let status=q('recordSaveStatus');
    if(!status){
      status=document.createElement('div');status.id='recordSaveStatus';status.className='notice';status.setAttribute('role','status');status.setAttribute('aria-live','polite');count.after(status);
    }
    const actions=count.parentElement?.querySelector('.actions');
    btn=document.createElement('button');btn.type='button';btn.id='recordCommitButton';btn.className='primary';btn.textContent='この内容を正式保存';btn.disabled=true;
    if(actions)actions.appendChild(btn);else status.after(btn);
    btn.addEventListener('click',commitPendingRecord);
    return btn;
  }
  function setStatus(text,type='normal'){
    ensureSaveUi();
    const el=q('recordSaveStatus');if(!el)return;
    el.textContent=text||'';
    el.style.fontWeight=text?'800':'';
    el.style.color=type==='error'?'#b42318':type==='success'?'#166534':type==='warn'?'#8a5a00':'#667085';
  }
  function setGenerateDisabled(disabled){
    document.querySelectorAll('button').forEach(b=>{
      const t=(b.textContent||'').trim();
      if(t==='AIで記録作成'||t==='別の文章を作る'||t==='入力内容で作り直す')b.disabled=disabled;
    });
  }
  function services(){return [...document.querySelectorAll('input[name="serviceContent"]:checked')].map(x=>x.value).sort()}
  function formSignature(){
    return JSON.stringify({
      user:q('user')?.value||'',service:q('service')?.value||'',scene:q('scene')?.value||'',condition:q('condition')?.value||'',health:q('health')?.value||'',length:q('length')?.value||'',intervention:q('interventionLevel')?.value||'',services:services(),input:q('input')?.value||'',facts:window.NexiaFactUI?.signature()||''
    });
  }
  function currentResultIsValid(){
    const v=(q('visitResult')?.textContent||'').trim(),c=(q('careResult')?.textContent||'').trim();
    if(window.__nexiaFactsMode)return !!v&&!!c&&c.startsWith(window.NexiaFactCore.INTRO);
    return !!v&&!v.includes('ここに')&&!v.includes('選択してください')&&!!c&&!c.includes('ここに')&&!c.includes('入力してください');
  }
  function syncPendingText(){
    if(!pendingRecord)return;
    pendingRecord.visitNote=q('visitResult')?.textContent||pendingRecord.visitNote||'';
    pendingRecord.careNote=q('careResult')?.textContent||pendingRecord.careNote||'';
    if(pendingHistoryArgs?.length>=2){pendingHistoryArgs[1]='【訪問時】'+pendingRecord.visitNote+' 【支援中】'+pendingRecord.careNote;}
  }
  function clearPending(message=''){
    pendingRecord=null;pendingHistoryArgs=null;pendingSignature='';
    clearComparison();
    const btn=ensureSaveUi();if(btn)btn.disabled=true;
    if(message)setStatus(message,'warn');
  }

  function patchFactSafeTemplates(){
    try{
      if(typeof serviceTemplates!=='undefined'){
        const safe={
          '服薬介助・確認':['服薬に必要な準備と声かけを行い、本人の様子を確認しながら支援した。','服薬前後の本人の様子を確認し、必要な準備・声かけ・確認を行った。'],
          'トイレ介助':['移動時の足元と周囲の安全に注意し、必要な見守り・介助を行った。','本人のペースに合わせ、排泄に必要な移動・衣類調整等を必要な範囲で支援した。'],
          '入浴介助':['入浴前に本人の様子を確認し、安全面に配慮しながら必要な介助を行った。','浴室内の足元や動作に注意し、本人のペースに合わせて必要な見守り・介助を行った。'],
          '更衣介助':['衣類を準備し、本人のペースに合わせて必要な更衣支援を行った。','本人が行える動作は見守り、必要な部分のみ更衣を介助した。'],
          '食事介助':['食事姿勢と本人のペースに配慮し、必要な見守り・介助を行った。','摂取中の本人の様子を確認しながら、必要な声かけ・介助を行った。'],
          '口腔ケア':['必要物品を準備し、本人の様子を確認しながら口腔ケアを支援した。','本人のペースに合わせて必要な声かけ・介助を行った。'],
          '起床介助':['覚醒状態を確認し、本人のペースに合わせて起き上がりを支援した。','足元と動作の安全に注意し、必要な見守り・介助を行った。'],
          '就寝介助':['就寝準備を整え、本人のペースに合わせて必要な支援を行った。','就寝前の本人の様子を確認し、安全に休めるよう必要な支援を行った。'],
          '清容・保清':['本人の希望と様子を確認し、必要な範囲で清容・保清を支援した。','本人が行える部分は見守り、必要な部分のみ支援した。'],
          '移動介助':['周囲と足元の安全を確認し、本人のペースに合わせて必要な移動支援を行った。','移動中の本人の様子を確認しながら、必要な見守り・介助を行った。'],
          '通院等介助':['外出前に予定と持ち物を確認し、移動中の安全に配慮して付き添った。','本人の様子を確認しながら、通院等に必要な移動・手続きを支援した。'],
          '買い物・外出支援':['本人の希望を確認し、移動中の安全に配慮して外出を支援した。','本人が選択できるよう必要な声かけを行いながら支援した。'],
          '家事援助':['本人の希望を確認し、必要な家事援助を行った。','作業内容を確認し、本人の生活状況に配慮しながら必要な家事を行った。'],
          '入浴準備':['本人の様子を確認し、必要物品と浴室内の安全を確認して入浴準備を行った。','入浴を始められるよう必要な環境整備を行った。'],
          'その他':['本人の希望と当日の様子を確認し、必要な支援を行った。','本人の反応を確認しながら、必要な範囲で支援した。']
        };
        Object.entries(safe).forEach(([name,arr])=>{
          if(!serviceTemplates[name])return;
          serviceTemplates[name].short=[arr[0]];
          serviceTemplates[name].normal=arr.slice();
          serviceTemplates[name].long=[arr[0],arr[1],'支援中も本人の反応を確認し、必要に応じて支援方法を調整した。'];
        });
      }
    }catch(e){console.warn('fact-safe template patch skipped',e)}

    try{
      if(typeof buildVisitRecord==='function'){
        window.buildVisitRecord=function(_len,scene,condition,health){
          const sceneMap={
            'ベッド上で仰臥位で寝ていた':'訪問時はベッド上で仰臥位となり、入眠されていた。',
            'ベッド上で仰臥位で休んでいた':'訪問時はベッド上で仰臥位となり、休まれていた。',
            'ベッド上で側臥位で休んでいた':'訪問時はベッド上で側臥位となり、休まれていた。',
            'ベッド上で上体を起こしていた':'訪問時はベッド上で上体を起こして過ごされていた。',
            'ベッド端に座っていた':'訪問時はベッド端に座って過ごされていた。',
            '椅子・座椅子に座っていた':'訪問時は室内の椅子・座椅子に座って過ごされていた。',
            '座ってテレビを見ていた':'訪問時は座った状態でテレビを見て過ごされていた。',
            'ベッド上でテレビを見ていた':'訪問時はベッド上でテレビを見て過ごされていた。',
            'スマートフォンを操作していた':'訪問時はスマートフォンを操作して過ごされていた。',
            '音楽を聴いて過ごしていた':'訪問時は音楽を聴いて過ごされていた。',
            '食事をしていた':'訪問時は食事をされていた。',
            '飲み物を飲んでいた':'訪問時は飲み物を飲んで過ごされていた。',
            '室内を歩いていた':'訪問時は室内を歩いて過ごされていた。',
            '身の回りの物を整理していた':'訪問時は身の回りの物を整理されていた。',
            '横になって休んでいた':'訪問時は横になって休まれていた。',
            '入眠していた':'訪問時は入眠されていた。',
            '起床直後だった':'訪問時は起床直後の様子であった。',
            'テレビをつけて静かに過ごしていた':'訪問時はテレビをつけた状態で静かに過ごされていた。',
            '何もせずゆっくり過ごしていた':'訪問時は室内でゆっくり過ごされていた。',
            'その他':'訪問時の姿勢や過ごし方を確認した。'
          };
          const out=[];
          if(scene)out.push(sceneMap[scene]||normalize(scene));
          if(condition)out.push(normalize(condition));
          if(health)out.push(normalize(health));
          return out.join('')||'訪問時の状態・様子・体調を選択してください。';
        };
      }
    }catch(e){console.warn('visit safety patch skipped',e)}
  }

  function patchSensitiveCache(){
    removeSensitiveCache();
    try{
      if(typeof window.saveUsers==='function')window.saveUsers=function(){removeSensitiveCache()};
      if(typeof window.saveProfiles==='function')window.saveProfiles=function(){removeSensitiveCache()};
    }catch(_e){}
  }

  function getDb(){
    if(safetyDb)return safetyDb;
    const cfg=window.AI_KIROKU_CONFIG;
    if(!window.supabase||!cfg?.supabaseUrl||!cfg?.supabasePublishableKey)return null;
    safetyDb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    return safetyDb;
  }
  function applyServiceLabel(label){
    const map=[['起床','起床介助'],['就寝','就寝介助'],['排泄','トイレ介助'],['トイレ','トイレ介助'],['食介','食事介助'],['食事','食事介助'],['入浴','入浴介助'],['更衣','更衣介助'],['服薬','服薬介助・確認'],['口腔','口腔ケア'],['家事','家事援助'],['通院','通院等介助']];
    for(const [needle,value] of map){
      if(String(label||'').includes(needle)){
        const cb=[...document.querySelectorAll('input[name="serviceContent"]')].find(x=>x.value===value);if(cb)cb.checked=true;
      }
    }
  }
  async function loadTrustedAssignmentContext(){
    const params=new URLSearchParams(location.search),id=params.get('assignment');
    if(params.get('from')!=='assignment'||!id)return;
    const db=getDb();if(!db)return;
    try{
      const {data:a,error}=await db.from('staff_assignments').select('id,organization_id,client_id,service_date,service_time,assigned_staff_name,memo').eq('id',id).single();
      if(error||!a)throw error||new Error('担当情報がありません');
      const [{data:c,error:ce},{data:s,error:se}]=await Promise.all([
        db.from('clients').select('id,code,display_name').eq('id',a.client_id).eq('organization_id',a.organization_id).single(),
        db.from('client_service_slots').select('label,service_contents').eq('organization_id',a.organization_id).eq('client_id',a.client_id).eq('service_time',a.service_time).maybeSingle()
      ]);
      if(ce||!c)throw ce||new Error('利用者情報がありません');
      if(se)throw se;
      const ctx={assignmentId:a.id,client:c.code,date:a.service_date,time:String(a.service_time||'').slice(0,5),staff:a.assigned_staff_name||'',memo:a.memo||'',label:s?.label||'',clientId:c.id,organizationId:a.organization_id};
      window.assignmentContext=ctx;
      const card=q('assignmentContextCard'),text=q('assignmentContextText');if(card)card.classList.remove('hidden');
      if(text)text.textContent=`${ctx.date} ${ctx.time} / ${ctx.client}${c.display_name?' '+c.display_name:''} / 担当：${ctx.staff||'未設定'}${ctx.memo?' / メモ：'+ctx.memo:''}`;
      const userSel=q('user'),profileSel=q('profileUser');
      if(userSel&&[...userSel.options].some(o=>o.value===ctx.client))userSel.value=ctx.client;
      if(profileSel&&[...profileSel.options].some(o=>o.value===ctx.client)){profileSel.value=ctx.client;try{window.loadProfile?.()}catch(_e){}}
      const input=q('input');if(!window.__nexiaFactsMode&&input&&ctx.memo&&!input.value.trim()){input.value=ctx.memo;const cnt=q('inputCount');if(cnt)cnt.textContent=input.value.length+'文字'}
      const serviceChecks=[...document.querySelectorAll('input[name="serviceContent"]')];
      serviceChecks.forEach(cb=>{cb.checked=false;});
      if(Array.isArray(s?.service_contents)){
        serviceChecks.forEach(cb=>{cb.checked=s.service_contents.includes(cb.value);});
      }else applyServiceLabel(ctx.label);
      serviceChecks.forEach(cb=>cb.dispatchEvent(new Event('change',{bubbles:true})));
      window.dispatchEvent(new CustomEvent('nexia-assignment-loaded'));
      // Keep the return token while the name-registration gate is resolving asynchronously.
      // It only selects existing dashboard view state; record identity still comes from the database.
      const cleanParams=new URLSearchParams({from:'assignment',assignment:id});
      if(params.get('returnDashboard'))cleanParams.set('returnDashboard',params.get('returnDashboard'));
      history.replaceState(null,'',location.pathname+'?'+cleanParams.toString());
    }catch(e){
      console.error('assignment context load failed',e);
      const card=q('assignmentContextCard'),text=q('assignmentContextText');if(card)card.classList.remove('hidden');if(text)text.textContent='担当割当の情報を安全に読み込めませんでした。担当割当画面から開き直してください。';
      window.assignmentContext=null;
    }
  }

  function wrapGenerate(){
    if(typeof window.generate!=='function'||window.generate.__formalSaveWrapped)return;
    originalGenerate=window.generate;originalSave=window.cloudSaveRecord;originalAddHistory=window.addHistory;
    if(typeof originalSave!=='function')return;
    const wrapped=async function(...args){
      if(generationBusy||saveBusy)return;
      generationBusy=true;setGenerateDisabled(true);clearPending();setStatus('記録文を作成しています…');
      let captured=null,historyArgs=null,failed=false;
      const saveFn=window.cloudSaveRecord,historyFn=window.addHistory;
      window.cloudSaveRecord=async r=>{captured={...r}};
      window.addHistory=(...a)=>{historyArgs=a};
      try{await originalGenerate.apply(this,args)}catch(e){failed=true;console.error(e);setStatus('記録文の作成中にエラーが発生しました。もう一度お試しください。','error')}
      finally{window.cloudSaveRecord=saveFn;window.addHistory=historyFn;generationBusy=false;setGenerateDisabled(false)}
      if(failed)return;
      if(!captured||!currentResultIsValid()){setStatus('記録文を作成できませんでした。入力内容を確認してください。','error');return}
      pendingRecord=captured;pendingHistoryArgs=historyArgs;pendingSignature=formSignature();syncPendingText();
      try{
        generationBusy=true;setGenerateDisabled(true);await reviewHistory();
        const btn=ensureSaveUi();if(btn)btn.disabled=false;
        setStatus('未保存です。内容を確認して正式保存してください。','warn');
      }catch(e){clearComparison();setStatus('過去記録との比較ができていません。'+e.message+' 内容を保持したまま「AIで記録作成」を押して再確認してください。','error');}
      finally{generationBusy=false;setGenerateDisabled(false);}
    };
    wrapped.__formalSaveWrapped=true;window.generate=wrapped;
  }

  async function assignmentRecordCount(){
    const id=window.assignmentContext?.assignmentId;if(!id)return 0;
    const db=getDb();if(!db)return 0;
    const {count,error}=await db.from('care_records').select('id',{count:'exact',head:true}).eq('assignment_id',id);
    if(error)throw error;return count||0;
  }
  function clearComparison(){
    comparison=null;q('recordSimilarityNotice')?.remove();
    const btn=q('recordCommitButton');if(btn)btn.textContent='この内容を正式保存';
  }
  function renderComparison(){
    q('recordSimilarityNotice')?.remove();
    if(!comparison||comparison.record!==pendingRecord)return;
    const checker=window.NexiaRecordSimilarity,scope=pendingRecord.factContext;
    const visit=q('visitResult')?.textContent||'',care=q('careResult')?.textContent||'';
    const matches=checker.compare({...scope,visitNote:visit,careNote:care},comparison.rows);
    comparison.text=JSON.stringify([visit,care]);
    const notice=document.createElement('section');notice.id='recordSimilarityNotice';notice.setAttribute('aria-live','polite');notice.dataset.matches=String(matches.length);
    const title=document.createElement('p');title.textContent=matches.length?`過去の記録と文章が一致・類似しています（${matches.length}件）。当日の支援・本人の状態・反応を確認してください。同じ事実であれば、文章を変えずに正式保存できます。`:`閲覧可能な直近${checker.LIMIT}件では、同じ・似た文章は見つかりませんでした。`;
    notice.append(title);
    const range=document.createElement('p');range.className='notice';range.textContent=`比較対象：この施設・利用者の閲覧可能な直近${checker.LIMIT}件（今回${comparison.rows.length}件）。必須冒頭文・空白・句読点を除いて比較。意味の正しさを保証する判定ではありません。`;notice.append(range);
    if(matches.length){
      const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='比較した過去記録を見る（最大3件）';details.append(summary);
      for(const r of matches.slice(0,3)){const heading=document.createElement('h3'),text=document.createElement('p');heading.textContent=`${r.service_date||String(r.created_at||'').slice(0,10)||'日付不明'}：${r.kind==='exact'?'文章が一致':'似た文章'}`;text.textContent='① '+(r.visit_note||'')+'\n② '+(r.care_note||'');details.append(heading,text);}
      notice.append(details);
    }
    q('recordSaveStatus').before(notice);
    q('recordCommitButton').textContent=matches.length?'当日の事実として正式保存':'この内容を正式保存';
  }
  async function reviewHistory(){
    if(!window.__nexiaFactsMode)return;
    const checker=window.NexiaRecordSimilarity,record=pendingRecord,scope=record?.factContext;
    if(!checker||!window.NexiaFactUI?.context||!scope)throw Error('過去記録の比較処理を読み込めません。再読み込みしてください。');
    const signature=formSignature(),generatedVisit=record.visitNote,generatedCare=record.careNote;
    const unchanged=()=>pendingRecord===record&&signature===formSignature()&&q('user')?.value===record.userCode&&localStorage.getItem('activeOrganizationId')===scope.organizationId;
    const verify=()=>{if(!unchanged())throw Error('比較中に施設・利用者・入力・文章が変更されました。内容を確認して保存し直してください。');};
    setStatus('同じ施設・利用者の過去記録を確認しています…');
    const c=await window.NexiaFactUI.context();verify();
    if(c.org!==scope.organizationId||c.actor!==scope.actorId)throw Error('作成時と現在の施設・ログイン職員が一致しません。作り直してください。');
    const history=await checker.load(c.db,scope);verify();
    if(q('visitResult')?.textContent===generatedVisit&&q('careResult')?.textContent===generatedCare)window.NexiaFactUI.rephrase?.(record,history.rows);
    syncPendingText();comparison={record,rows:history.rows,text:''};renderComparison();
  }
  async function commitPendingRecord(){
    if(saveBusy||!pendingRecord)return;
    if(pendingSignature!==formSignature()){
      setStatus('入力内容が記録文作成後に変更されています。もう一度「AIで記録作成」を押してください。','error');return;
    }
    if(window.assignmentContext?.client&&pendingRecord.userCode!==window.assignmentContext.client){
      setStatus('担当割当の利用者と現在の利用者が一致しません。担当割当から開き直してください。','error');return;
    }
    if(window.__nexiaFactsMode&&!(q('careResult')?.textContent||'').startsWith(window.NexiaFactCore.INTRO))return setStatus('②の必須冒頭文を先頭に戻してから保存してください。','error');
    syncPendingText();
    if(!currentResultIsValid())return setStatus('保存する記録文を確認できません。もう一度作成してください。','error');
    if(window.__nexiaFactsMode){
      if(!comparison||comparison.record!==pendingRecord)return setStatus('過去記録との比較が完了していません。「AIで記録作成」を押して再確認してください。','error');
      if(localStorage.getItem('activeOrganizationId')!==pendingRecord.factContext.organizationId)return setStatus('施設が変更されています。記録を作り直してください。','error');
      if(comparison.text!==JSON.stringify([pendingRecord.visitNote,pendingRecord.careNote])){renderComparison();if(q('recordSimilarityNotice')?.dataset.matches!=='0')return setStatus('編集した文章の類似状況を更新しました。当日の事実と確認してから正式保存してください。','warn');}
    }
    const savingRecord=pendingRecord,savingSignature=formSignature(),savingVisit=pendingRecord.visitNote,savingCare=pendingRecord.careNote;
    saveBusy=true;const btn=ensureSaveUi();if(btn)btn.disabled=true;setGenerateDisabled(true);
    try{
      const existing=await assignmentRecordCount();
      if(existing>0&&!confirm(`この担当には正式記録がすでに${existing}件あります。\n追加記録として保存しますか？`)){
        setStatus('保存を中止しました。既存の記録を確認してください。','warn');return;
      }
      if(pendingRecord!==savingRecord||formSignature()!==savingSignature||q('visitResult')?.textContent!==savingVisit||q('careResult')?.textContent!==savingCare)throw Error('確認中に入力・文章が変更されました。内容を確認して保存し直してください。');
      setStatus('クラウドへ正式保存しています…');
      await originalSave(pendingRecord);
      if(typeof originalAddHistory==='function'&&pendingHistoryArgs)originalAddHistory(...pendingHistoryArgs);
      pendingRecord=null;pendingHistoryArgs=null;pendingSignature='';
      clearComparison();
      setStatus('✓ 正式にクラウド保存しました。','success');
      window.dispatchEvent(new CustomEvent('nexia-record-saved'));
    }catch(e){console.error(e);setStatus('保存できていません。'+(e?.message||'通信状態を確認して、もう一度お試しください。'),'error')}
    finally{saveBusy=false;setGenerateDisabled(false);if(btn)btn.disabled=!pendingRecord}
  }
  function wrapShorten(){
    const original=window.shortenCareResult;if(typeof original!=='function'||original.__formalSaveWrapped)return;
    const wrapped=function(...args){const before=q('careResult')?.textContent||'';const out=original.apply(this,args);const after=q('careResult')?.textContent||'';if(pendingRecord&&after&&after!==before){syncPendingText();setStatus('②を短くした内容は未保存です。「この内容を正式保存」を押してください。','warn')}return out};
    wrapped.__formalSaveWrapped=true;window.shortenCareResult=wrapped;
  }
  function guardPendingChanges(){
    for(const id of ['visitResult','careResult'])q(id)?.addEventListener('input',()=>{if(comparison&&pendingRecord)renderComparison();});
    document.addEventListener('change',e=>{if(['user','orgSwitch'].includes(e.target.id)){clearComparison();q('recordCommitButton').disabled=true;}});
    window.addEventListener('storage',e=>{if(e.key==='activeOrganizationId')clearPending();});
    ['user','service','scene','condition','health','length','interventionLevel','input'].forEach(id=>q(id)?.addEventListener('change',()=>{if(pendingRecord&&pendingSignature!==formSignature())setStatus('入力内容が変更されています。保存前に記録文を作り直してください。','warn')}));
    document.querySelectorAll('input[name="serviceContent"]').forEach(el=>el.addEventListener('change',()=>{if(pendingRecord&&pendingSignature!==formSignature())setStatus('サービス内容が変更されています。保存前に記録文を作り直してください。','warn')}));
    window.addEventListener('beforeunload',e=>{if(!pendingRecord)return;e.preventDefault();e.returnValue=''});
  }
  function boot(){
    ensureSafetyNotice();ensureSaveUi();patchFactSafeTemplates();patchSensitiveCache();wrapGenerate();wrapShorten();guardPendingChanges();loadTrustedAssignmentContext();
  }

  let tries=0;const timer=setInterval(()=>{
    tries++;
    if(typeof window.generate==='function'&&q('careResult')&&typeof window.cloudSaveRecord==='function'){clearInterval(timer);boot()}
    else if(tries>80){clearInterval(timer)}
  },125);
})();
