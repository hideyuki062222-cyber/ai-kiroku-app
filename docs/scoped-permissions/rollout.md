# 本番反映・バックアップ・切り戻し手順

2026年11月20日（日本時間）。**この手順は未実施です。本番SQL・mainマージ・公開には、この変更への別途承認が必要です。**

## バックアップと復元の確認

参照：[Supabase公式バックアップ手順](https://supabase.com/docs/guides/platform/backups)、[CLI db dump](https://supabase.com/docs/reference/cli/supabase-db-dump)。CLI 2.81.3 の `db dump --help` で `--schema`、`--data-only`、`--use-copy`、`--role-only` を確認しました。

- 有料PITR・プラン変更は行いません。Freeでも手動の論理ダンプを利用できます。自動バックアップのダウンロード・復元が現在の契約で利用できるかは未確認です。
- **本番のバックアップ実物と復元成功は未確認です。** 本番を変更する前に、運用担当の安全な接続情報で取得し、別の隔離Postgresへ復元して確認することを適用条件とします。接続パスワード・サービスロールキーをリポジトリ、ブラウザ、会話ログに保存しません。
- 保存するもの：`public` / `private` / `meal_history` のスキーマ・RLS・関数・トリガー・権限とデータ、移行履歴、現在の管理者・所属・施設編集者の対応。全体復元に必要なAuthユーザーID・Auth設定も公式手順に従って別途確認します。標準のアプリスキーマdumpだけでAuthやStorageまで復元できるとは扱いません。
- Storageの実ファイルはDBダンプに含まれません。今回Storageを変更しませんが、全体復元を選ぶ場合は別途保全が必要です。
- ダンプには個人情報が含まれます。公開PRへ添付せず、アクセス制限した保存先で暗号化・保管します。

アプリスキーマの手動取得例（接続先・保存先は運用環境で指定。ここでは未実行）：

```sh
supabase db dump --db-url "$NEXIA_DB_URL" --schema public,private,meal_history --file "$NEXIA_BACKUP_DIR/app-schema.sql"
supabase db dump --db-url "$NEXIA_DB_URL" --schema public,private,meal_history --data-only --use-copy --file "$NEXIA_BACKUP_DIR/app-data.sql"
```

この2ファイルだけを本番に流し戻してはいけません。まず隔離環境で必要なロール・Auth参照を用意し、公式の復元順序に従ってスキーマとデータを復元します。施設数・所属・職員ID・旧権限・記録件数・提供単価・確定請求額・出納残高を照合します。今回の開発では架空DBで移行・保全・互換モード・復帰をテストしました。本番ダンプの復元試験とは区別します。

## 承認後の順序

1. PRの対象コミットとCI成功を確認。本番の直前バックアップ・隔離復元・現在の権限一覧の保全を完了する。
2. 本番の関数・RLSに開発開始後の変更がないか再確認。差分があればSQLを適用せず調整・再テストする。
3. 旧画面からの権限変更操作を一時停止して案内する。記録作成・申し送り確認・食事提供などの日常業務は維持する。
4. `supabase/migrations/20261119144626_granular_facility_permissions.sql` を1トランザクションで適用。ロック待ち上限は5秒。失敗時はロールバックし、安易に繰り返さない。
5. 有効な旧施設編集者それぞれについて、旧4機能がすべて `legacy`、追加4機能が0件であることを確認。管理者・一般職員の基本role、旧enabledフラグ、業務データの件数・値が変わっていないことを照合する。SQL内にも不一致時に中止する検証がある。
6. 同じ承認対象のフロントをmainへマージして既存GitHub Pagesへ公開する。SQL先行・画面後行とする。SQLだけ先行している間も未移行の旧RPCは従来4範囲に限定する。
7. ブラウザを更新し、新しい権限画面を使用する。機能別保存済みの職員を旧 `set_facility_editor` から操作すると `permission_ui_upgrade_required` で拒否するため、古いタブを更新する。新画面からの保存には版番号が必要。
8. 管理者と検証用一般職員で確認。実在職員に追加機能を無断付与せず、必要な機能だけ管理者が明示的に選ぶ。料金はこの移行で設定・有効化しない。

検証例（管理者の読み取り専用SQL。氏名を出さずIDで照合）：

```sql
select e.organization_id,e.user_id,
       count(p.feature) filter(where p.scope='legacy' and p.feature in
         ('resident_info','handoff_settings','meal_settings','assignment_settings')) as legacy_features,
       count(p.feature) filter(where p.feature in
         ('record_management','cashbook_management','staff_info','exports')) as new_features
from public.organization_facility_editors e
join public.organization_members m using(organization_id,user_id)
left join public.organization_feature_permissions p using(organization_id,user_id)
where e.enabled and m.role='staff'
group by e.organization_id,e.user_id;
```

## 障害時の切り戻し

SQL適用前／トランザクション中の失敗は、全体を中止して既存状態を維持します。SQLは適用後に同じファイルを再実行する設計ではありません。

適用後の封じ込めには `supabase/rollbacks/20261119144626_permission_compatibility.sql` を用意しました。**これも本番実行には承認が必要です。** 権限変更RPCを停止し、職員の拡張範囲を停止しながら旧4項目の施設別・機能別の許可を維持します。管理者・通常業務・元データ・保存済み権限行・訂正・監査履歴は削除しません。画面に古い編集ボタンが残ってもDBで拒否します。

- **旧enabledフラグだけで4機能を許可する関数へ戻してはいけません。** 出力だけを許可した職員に旧4機能まで付与される危険があります。
- 訂正履歴が存在する場合、元の記録だけを表示する旧 `record-history.js` に戻してはいけません。訂正後表示を維持する必要があります。
- 復帰用に `supabase/rollbacks/20261119144626_restore_permission_functions.sql` を用意し、互換モードから権限行を書き換えずに復帰する試験も実施しています。
- DB全体の復元は最終手段です。バックアップ後の実記録を失うため、影響範囲・差分保全・停止時間・復元試験を確認して別途承認を得ます。本番の一括上書きはこのPRの作業として実施しません。
