# 開発・反映の現在地（2026-10-29）

- feature/brook-recruitment-draft に独立した recruitment 画面・受付サーバー・SQL案・テストを保存。
- mainマージなし。SupabaseへのSQL適用・Edge Function配備・認証設定変更なし。求人公開なし。
- index.html/admin/index.htmlは本番用コードだが config.enabled=false。preview.htmlは通信しないメモリ内の確認専用版。
- database/recruitment_draft.sqlは廃止。誤実行を例外で止める。適用候補は recruitment_head_office_draft.sql のみ。
- 本番データバックアップは未取得。本番復元試験も未実施。ローカル採用テストDBの復元と混同しない。

## 次の作業
1. WindowsのPostgreSQL 17対応クライアント/pgAdmin、Session pooler接続情報を確認。パスワードはWindowsの接続欄に入力しチャット・GitHubに置かない。
2. DB全体・ロール・設定のバックアップを作り、取得ログ・ハッシュ・保管場所を記録。バックアップ原本を変更しない。
3. 隔離したSupabase互換環境に復元し、表・件数・関数・RLS・ログイン・出力を確認。既存sports-attendanceを試験先にしない。
4. 採用条件、案内文、担当者、無料の迷惑応募対策設定を確定。
5. 本番DB変更の具体的差分と復旧結果を示して承認を得る。その後、採用専用SQLと受付サーバーだけを適用。
6. 全体公開は閉じたまま実ユーザーの権限・送信検証。その後、求人公開の承認を得る。

## 配備メモ（開発者向け）
- 新規Edge Function名: brook-recruitment-intake。未認証応募を受けるためこの関数だけverify_jwt=false。既存関数は変更しない。
- 必須環境変数: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY（サーバーのみ）, BROOK_ALLOWED_ORIGINS（完全なoriginリスト）, TURNSTILE_SECRET_KEY, BROOK_CONTACT_HASH_SECRET（ランダム秘密値）, BROOK_INTAKE_ENABLED。
- 起動スイッチはフロント、Edge、DBの3か所すべて既定で閉。ドメイン/CAPTCHAを本番URLで検証するまで開けない。
- 依存なしのFetch実装。Deno配備後の実環境動作はまだ未検証。
- 既存Auth設定は共用するが、ブラウザセッションは独立・メモリのみ。再読込後は再ログイン。
- 学校送付・メール自動返信・有料アドオン・DB開発ブランチの作成は行わない。
