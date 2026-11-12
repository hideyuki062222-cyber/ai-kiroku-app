# NEXIA（ネクシア）統合業務管理システム

Supabaseをバックエンドに使用したクラウド共有版Webアプリです。

通常の入口 `/ai-kiroku-app/` はNEXIAトップ `/ai-kiroku-app/home/` を開きます。既存の職員アカウントでログインし、今日の担当・AI記録・担当割当・申し送り・出勤簿・食事管理・金銭出納帳へ進めます。同一オリジンの既存Supabaseセッションを共有します。

AI記録を直接開く場合は `/ai-kiroku-app/?app=record` を使用します。既存の `?from=assignment&assignment=…`、`?from=record&record=…`、その他のクエリ・認証用ハッシュ付きURLは、引き続き従来の記録画面で処理します。

調査結果、URL互換性、権限、テスト、本番反映時の手順は [NEXIA開発報告](docs/nexia-integration.md) を参照してください。
