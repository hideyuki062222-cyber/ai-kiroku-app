# 施設共有の食事管理

既存のSupabase Auth、organizations、organization_members、clientsを使用。新たな有料サービスやAI API呼び出しなし。公開静的HTMLには利用者データを含めず、データはログイン後に施設別RLSで取得する。

- 朝330円、昼440円、晩550円が初期料金。欠食・未提供は請求0円。
- 管理者が利用者ごとの開始/終了日、曜日、食事、食事形態、各食の白米量を設定する。初期表示の150gは仮値で、確認して保存する。
- 月間予定の一括登録は空欄だけを登録。既存の提供・欠食は保持する。
- 提供チェックは即保存。同時更新はrevisionで検出し、再読み込みを案内する。
- 初回提供時の単価・食事形態・白米量をDBで保存。料金改定で提供済み金額は変化しない。
- 月間集計、個人の日別明細、印刷、CSV出力。未登録と欠食は区別し、要確認件数を表示する。
- DB側で変更者・更新日時を設定。復旧用の変更履歴は非公開meal_historyスキーマに保存する。
- AI記録への自動書き込みはしない。共通client_idで将来の連携に備える。
- 他の端末の更新は「最新に更新」で取得する。

## 導入・検証

Supabase migration `shared_meal_management` に `supabase/meals_setup.sql` を適用済み。既存テーブル・ポリシーは変更しない。SQLの再適用は不可。

`tests/meals_rls.sql` を BEGIN / ROLLBACK 内で実行。実メンバーのロールを使い、検証用利用者・食事レコードをトランザクション内だけ作成する。本番食事記録は作成しない。

```
node --check meals/app.js
node tests/meals_core.cjs
JSDOM_PATH=/path/to/jsdom node tests/meals_dom.cjs
```

DOMテストは合成データを使用。実ブラウザでも合成データによるデスクトップ・390px表示確認を実施。実利用者の初期設定およびログイン済み端末での最終確認は管理者が行う。
