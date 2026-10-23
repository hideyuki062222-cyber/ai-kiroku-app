'use strict';
const f=document.getElementById('loginForm'),s=document.getElementById('loginStatus');
if(!window.mealDB){s.textContent=mealConnectionError;f.querySelector('button').disabled=true;}
else f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;s.textContent='確認中…';const d=new FormData(f);try{const r=await mealDB.auth.signInWithPassword({email:String(d.get('email')).trim(),password:String(d.get('password'))});if(r.error)throw Error('ログインできません。メールアドレスとパスワードを確認してください。');f.reset();location.href='index.html';}catch(e){s.textContent=e.message;}finally{b.disabled=false;}};

const sf=document.getElementById('signupForm'),ss=document.getElementById('signupStatus');
if(!window.mealDB){sf.querySelector('button').disabled=true;}
else sf.onsubmit=async e=>{e.preventDefault();const d=new FormData(sf),b=sf.querySelector('button'),password=String(d.get('password'));if(password!==d.get('confirm')){ss.textContent='確認用のパスワードが一致しません。';return;}b.disabled=true;ss.textContent='登録中…';try{const r=await mealDB.auth.signUp({email:String(d.get('email')).trim(),password});if(r.error)throw Error('登録できません。登録済みの場合はログインしてください。解決しない場合は管理者にご連絡ください。');sf.reset();ss.textContent=r.data?.session?'登録しました。管理者に施設への追加を依頼してください。追加後、このページからログインできます。':'確認メールが届いた場合は確認を完了してからログインしてください。登録済みの方はログインしてください。';}catch(e){ss.textContent=e.message;}finally{b.disabled=false;}};
