# Windowsの無料バックアップと復元確認

調査日: 2026-10-29（日本時間）。取得・本番復元はまだ完了していません。

## 現在確認した事実
対象はSupabase「AI記録作成」。無料プラン、PostgreSQL 17.6、DB全体17MB。publicの業務表25、Authユーザー13。Storageのバケット・オブジェクト0、Vault内秘密情報0。採用専用テーブル0。読み取り照会のみ実施しました。件数・容量は照会時点で変わり得ます。

## 選択
Windowsでコードを入力せず取得する場合、無料のPostgreSQL 17対応のpgAdminでCustom形式のDB全体バックアップが可能です。Windowsの公式インストーラーにはpgAdminも含まれます。Docker Desktopの有料対象条件に依存せず、追加のSupabaseプロジェクトも作りません。

Supabaseが案内する標準の移行用バックアップはCLIによるロール・スキーマ・データの3分割です。既にCLI環境があるならそちらを優先しても構いません。CustomアーカイブとCLIのSQLファイルは復元方法が異なります。CSVだけでは権限・関数・制約などが足りないため完全バックアップと呼びません。

## 取得の操作（Windowsの現在地確認後、未実施分だけ進める）
1. PostgreSQL 17系の最新修正版とpgAdminがあるか確認。既に入っていれば再インストールしない。pgAdminのバイナリパスが17以上のpg_dumpを参照していることを確認。
2. Supabase対象プロジェクトのConnectを開く。IPv4環境ではSession pooler（5432）を選び、その画面のHost/User/Databaseを使う。Transaction pooler（6543）や有料IPv4アドオンは使わない。ホスト名を推測しない。
3. pgAdminのRegister Serverで接続名を「AI記録作成・バックアップ元」とし、Connectの値を転記。データベースのパスワードはWindowsの入力欄だけに入力。APIキーとは別物。TLSを有効にする。分からない場合にパスワードを勝手にリセットしない。
4. Databases内のpostgresを右クリックしてBackup。テーブル単体やpublicだけを選ばずDB全体を選択。FormatはCustom、ファイル名に取得日時を入れる。Data only/Schema onlyは両方オフ。Pre-data、Data、Post-dataを含め、所有者・権限・ポリシーを除外しない。
5. Processesで成功終了とエラーなしを確認。ファイルサイズと取得日時を記録。エラーがあれば「成功扱い」にしない。読めないスキーマがある場合、勝手に除外して完全バックアップとしない。
6. ロールなどDB外の共有定義は別途取得。pgAdminのBackup Globals、またはSupabase公式CLIのroles-onlyを使う。管理ロールの権限により失敗する場合は役割一覧と必要なアプリロールを確認して補完する。ロールのパスワードは別管理。
7. Auth設定、許可URL、SMTP、Edge Functionソース・設定、Realtime設定、API設定はDBのアーカイブだけでは戻らないため別途記録する。秘密値は暗号化された保管先のみ。現在Storageは0件だが取得当日に再確認し、存在すれば実ファイルも別保存する。
8. 原本を変更せず、アクセスを限定した暗号化保管先に保存。共有フォルダ・GitHubに置かない。別媒体のコピーも作る。SHA-256などでコピーの同一性を確認する。

## 復元可能性の合格条件
取得ファイルが存在するだけ、一覧が読めるだけでは合格にしません。

- 元のAI記録作成とsports-attendanceには復元しない。別のローカル検証環境を用意し、誤接続を防ぐ。
- 元環境と互換性のあるPostgreSQL・Supabase拡張・auth/storage等を用意。普通のPostgreSQLだけではsupabase_vault等が不足するため、それを使った復元は完全復元の証明にならない。
- 無料のローカルSupabase環境を候補にする。WindowsのWSL2＋Docker Engine等の無料ランタイムが使用できるか確認する。Docker Desktopの無料利用条件は確認なしに仮定しない。
- Custom形式はpg_restore/pgAdmin Restore、CLIのSQL形式は公式のロール→スキーマ→データ手順。新しい環境に存在する管理オブジェクトとの重複は一覧化して対処。全エラーの無視や本番に対するClean/Dropは禁止。
- 復元先で業務表・ログイン情報・データ件数・主要レコード・外部キー・シーケンス・関数・トリガー・RLS・GRANT・Realtime設定を確認。バックアップ時点の記録と比較する（取得後に増えた本番データとの単純比較はしない）。
- 管理者と一般職員の2種類でログイン・権限確認。AI記録、出勤簿のExcel、食事管理の保存・集計を復元先で確認。テスト用の追加データは本番に送らない。
- 取得ファイル名・ハッシュ・取得時刻・復元先・使用バージョン・エラー処理・件数差・業務機能の結果を残す。失敗または未確認があれば、本番変更の許可を求める段階には進まない。

## 今回の検証との差
今回実施したのは「新しい採用SQLを隔離したPGliteで動かし、テスト用データをdumpDataDirで書き出して再読み込みした」試験です。pg_dump/pg_restoreの本番バックアップ復元やSupabase Authサービスの復元試験ではありません。

## 公式資料
- https://www.postgresql.org/download/windows/
- https://www.postgresql.org/about/licence/
- https://www.pgadmin.org/docs/pgadmin4/latest/backup_dialog.html
- https://www.pgadmin.org/docs/pgadmin4/latest/restore_dialog.html
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://docs.docker.com/engine/install/ubuntu/
