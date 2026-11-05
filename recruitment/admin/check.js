/* Separate, read-only screen. Login tokens remain in memory. */
(()=>{'use strict';
 const api=new window.BrookApi({enabled:true,url:'https://pagamoaxhqszojxrpxyu.supabase.co',key:'sb_publishable_GQFRQYCo2oACYAh9lj9ZyA_JqfIPJGT'}),$=id=>document.getElementById(id);
 let token='',widget=null,generation=0,scriptPromise;
 const say=text=>{$('result').textContent=text;};
 const clearToken=()=>{token='';$('check-button').disabled=true;};
 function logout(){generation++;api.logout();clearToken();if(widget!==null){window.turnstile?.remove(widget);widget=null;}$('login').hidden=false;$('check-panel').hidden=true;$('password').value='';say('ログアウトしました。');}
 window.addEventListener('brook-auth-lost',logout);
 function loadScript(){if(window.turnstile)return Promise.resolve();if(scriptPromise)return scriptPromise;scriptPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=resolve;script.onerror=()=>{script.remove();scriptPromise=null;reject(Error('確認欄を読み込めません。通信を確認し「確認をやり直す」を押してください。'));};document.head.append(script);});return scriptPromise;}
 async function challenge(){const current=generation;clearToken();try{await loadScript();if(current!==generation||!api.token)return;if(widget!==null)window.turnstile.remove(widget);widget=window.turnstile.render('#challenge',{sitekey:'0x4AAAAAAF0LGDzsjs8HYp-W',action:'brook_apply',size:'flexible',callback:value=>{if(current!==generation)return;token=value;$('check-button').disabled=false;say('確認ができました。「接続テストを実行」を押してください。');},'expired-callback':()=>{clearToken();say('確認の有効期限が切れました。「確認をやり直す」を押してください。');},'error-callback':()=>{clearToken();say('確認欄を表示できません。「確認をやり直す」を押してください。');}});}catch(e){say(e.message);}}
 $('login').addEventListener('submit',async event=>{event.preventDefault();$('login-button').disabled=true;say('ログインしています…');try{await api.login($('email').value.trim(),$('password').value);$('password').value='';generation++;$('login').hidden=true;$('check-panel').hidden=false;say('確認欄を読み込んでいます…');await challenge();}catch(e){say(e.message);}finally{$('login-button').disabled=false;}});
 $('check-button').addEventListener('click',async()=>{if(!token)return;const current=generation,value=token;clearToken();$('retry-button').disabled=true;say('接続を確認しています…');try{const result=await api.request('/functions/v1/brook-recruitment-check',{method:'POST',body:JSON.stringify({captcha_token:value})});if(current===generation)say(result.message);}catch(e){if(current===generation)say(e.message+' 「確認をやり直す」から再試行できます。');}finally{$('retry-button').disabled=false;}});
 $('retry-button').addEventListener('click',()=>{generation++;say('確認欄を読み込んでいます…');challenge();});
 $('logout-button').addEventListener('click',logout);
})();
