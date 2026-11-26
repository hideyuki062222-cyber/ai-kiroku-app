(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const status = $('resetStatus');
  const steps = ['resetRequest', 'resetVerify', 'resetPassword'];
  let verifiedUserId = '';
  let busy = false;

  function notice(message, error = false) {
    status.textContent = message;
    status.classList.toggle('error', error);
    status.hidden = !message;
  }

  function show(step, focus) {
    for (const id of steps) $(id).hidden = id !== step;
    if (focus) $(focus).focus();
  }

  function run(form, action) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || form.hidden) return;
      busy = true;
      const buttons = Array.from(form.querySelectorAll('button'));
      for (const button of buttons) button.disabled = true;
      try {
        await action();
      } catch {
        notice('操作を完了できませんでした。通信状況を確認して、もう一度お試しください。', true);
      } finally {
        for (const button of buttons) button.disabled = false;
        busy = false;
      }
    });
  }

  if (!window.supabase?.createClient) {
    notice('再設定機能を読み込めませんでした。ページを再読み込みしてください。', true);
    return;
  }

  // The recovery session stays in memory so it cannot replace a shared device's staff session.
  const {auth} = window.supabase.createClient(
    'https://pagamoaxhqszojxrpxyu.supabase.co',
    'sb_publishable_GQFRQYCo2oACYAh9lj9ZyA_JqfIPJGT',
    {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}}
  );

  function showCode(email) {
    $('verifyEmail').value = email;
    show('resetVerify', email ? 'resetCode' : 'verifyEmail');
  }

  $('useCode').onclick = () => {
    notice('');
    showCode($('resetEmail').value.trim());
  };
  $('sendAgain').onclick = () => {
    $('resetEmail').value = $('verifyEmail').value;
    $('resetCode').value = '';
    notice('');
    show('resetRequest', 'resetEmail');
  };
  $('sendCode').disabled = false;
  $('useCode').disabled = false;

  run($('resetRequest'), async () => {
    const email = $('resetEmail').value.trim();
    notice('確認コードの送信をリクエストしています…');
    const {error} = await auth.resetPasswordForEmail(email);
    if (error?.name === 'AuthRetryableFetchError') {
      notice('通信状況を確認して、少し時間をおいてから再度お試しください。', true);
      return;
    }
    notice('登録済みのアドレスには確認コードが届きます。届かない場合は、アドレスと迷惑メールを確認し、時間をおいて再送してください。');
    showCode(email);
  });

  run($('resetVerify'), async () => {
    const email = $('verifyEmail').value.trim();
    const token = $('resetCode').value;
    if (!/^[0-9]{6,10}$/.test(token)) {
      notice('メールに記載された数字の確認コードを入力してください。', true);
      return;
    }
    notice('確認コードを照合しています…');
    const {data, error} = await auth.verifyOtp({email, token, type: 'recovery'});
    if (error || !data?.session || !data.user?.id) {
      notice(error?.status === 429
        ? '確認回数が上限に達しました。時間をおいて試してください。'
        : '確認できませんでした。メールアドレスと最新の確認コードを見直し、必要なら再送してください。', true);
      return;
    }
    verifiedUserId = data.user.id;
    $('resetCode').value = '';
    notice('');
    show('resetPassword', 'newPassword');
  });

  run($('resetPassword'), async () => {
    if (!verifiedUserId) return;
    const password = $('newPassword').value;
    if (Array.from(password).length < 12 || password !== $('confirmPassword').value) {
      notice('12文字以上の同じパスワードを2回入力してください。', true);
      return;
    }
    notice('パスワードを変更しています…');
    const {data, error} = await auth.updateUser({password});
    if (error || data?.user?.id !== verifiedUserId) {
      const messages = {
        weak_password: 'パスワードが安全性の条件を満たしていません。より長く推測されにくいパスワードを入力してください。',
        same_password: '以前と異なるパスワードを設定してください。'
      };
      if (error?.status === 401 || ['session_not_found', 'session_expired', 'bad_jwt', 'reauthentication_needed'].includes(error?.code)) {
        verifiedUserId = '';
        $('resetPassword').reset();
        $('resetEmail').value = $('verifyEmail').value;
        show('resetRequest', 'resetEmail');
        notice('確認の有効期限が切れました。確認コードを再送してください。', true);
      } else {
        notice(messages[error?.code] || '変更できませんでした。時間をおいて再度お試しください。', true);
      }
      return;
    }
    verifiedUserId = '';
    $('resetPassword').reset();
    show('');
    notice('パスワードを変更しました。新しいパスワードでログインしてください。');
    $('resetBack').focus();
    try {
      await auth.signOut({scope: 'local'});
    } catch {
      // The password update is already committed and the session is not persisted.
    }
  });
})();
