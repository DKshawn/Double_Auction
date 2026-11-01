# 開発・デプロイ・検証

[日本語](../ja/development.md) · [中文](../zh-CN/development.md) · [English](../en/development.md)

## ローカル起動

ローカルのプロジェクトフォルダーは `Exp-all-in-one` です。このフォルダーを開き、以下のコマンドをルートで実行します。

Node.js 24.xを使用します（`.nvmrc`・CI・Vercel の設定と共通）。`package.json` の `engines.node` も `24.x` に固定し、将来のメジャーバージョンへの自動切り替えを防ぎます。

```sh
npm ci
npm run dev
```

Windows の隔離したローカル検証環境は、`pwsh -NoProfile -File scripts/dev-local.ps1` で起動できます。ポートは3200、保存先は `.data/platform-verification` です。旧 EMH フォルダーは不要です。[整理記録](../../../docs/releases/emh-folder-consolidation.md)を参照してください。

`http://localhost:3000/teacher` を開き、ルームを作成します。学生の入室画面 `/` と共通ヘッダーには、教員ページ・デモへのリンクを表示しません。Neonの設定がなければ組み込みPostgreSQL（PGlite）の `.data/auction` に保存されます。同じ保存先を複数サーバーから開かないでください。本番はNeonを使用します。

## Vercel + Neon

| 環境変数             | 用途                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`       | Neonのpooled PostgreSQL接続文字列。Vercelで必須                            |
| `TEACHER_ACCESS_KEY` | ルーム作成・管理一覧・削除の教員用共通キー。Vercelで必須。学生に共有しない |
| `PGLITE_DATA_DIR`    | ローカルの任意のデータ保存先                                               |

GitHubからVercelにデプロイします。関数リージョンは `vercel.json` の `sin1` で、Neon Singaporeと合わせています。テーブルは初回接続で初期化します。手動の場合は `npm run db:migrate`。本番でローカルDBへはフォールバックしません。

`.env*`、`.data`、`work`、テスト成果物をGitに含めません。プレビュー用には別のNeonブランチを用意してください。

## 同期・整合性

SSEで注文・約定の変更を配信します。通常は認可済み表示の差分だけを送り、初回・再接続時には最新のスナップショットを送ります。Double Auction の学生履歴は現在制度で設定した期数に限定し、累積利益と教員の全期記録は保持します。通信が途切れた場合は再接続し、低頻度のHTTP再取得で補います。1人の切断で他の参加者や実験時計を自動停止することはありません。全市場の一時停止は教員の操作で行います。注文の締切判定は引き続きDBの時計を使います。

実験1の取引状態・重複排除ID・操作記録を市場別に保存します。学生の注文は所属市場の行だけを排他ロックし、教員の一時停止・再開などは共通設定のロックで全市場と調整します。状態と監査記録は同じトランザクションで確定します。締切は接続中のサーバーでも進行し、全員が切断していても次回アクセス時に記録済みの時刻から追いつきます。

ローカルPostgreSQLではLISTEN/NOTIFYで別アプリプロセスへ変更を通知します。オンラインの直接通知には追加の `REALTIME_DATABASE_URL`（LISTEN可能な直接接続）が必要です。未設定時はサーバーがルームごとの小さなバージョン一覧を確認して差分を配信します。クラウドでの能力・費用はローカルの実測から保証できません。

認証トークンはHttpOnly Cookie、DBにはハッシュだけを保存します。パスワード・PINはsalt付きscrypt。教員データは認証後のみ返し、学生には他人の価値・費用や他市場の注文を送りません。Callの注文板には本市場の価格・残数量だけを公開します。監査CSVには共通操作／市場を区別する記録スコープを追加しています。

[ローカルPostgreSQLの起動・192人の負荷試験手順](../../../docs/local-capacity-testing.md)を参照してください。`LOCAL_ONLY=1` と `LOCAL_DATABASE_URL` で、クラウド接続を防いだ検証ができます。PGliteの単一プロセス検証と、実際のPostgreSQLによる並行検証を区別します。

## 検証と開発方針

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

自動テストは3制度の取引、1〜5単位の限界価値と逐単位注文、順序の均衡割当、6市場96人のDB入室、並行要求、締切、休止、収束指標、非公開情報、出力、既存ルームとの互換性を確認します。

`tests/e2e` はPlaywrightのブラウザーテストです。`npm run test:e2e` でテスト専用ローカルDBを使用します。既存環境を指定する `E2E_BASE_URL` は本番に向けないでください。旧12人CDAの回帰テストと、新規教員フォームの実験1作成テストを含みます。

各モジュールの HTTP 検証は [EMH](emh.md) と [Judgement](judgment.md) を参照してください。

正式な実験は同じ `main` に保ち、短期の機能ブランチで開発し、検証後にマージしてブランチを削除します。共通の入口・ルーム・セッション・DB接続はプラットフォーム、実験のルールとデータは各モジュールが担当します。[構成と開発方針（English）](../../architecture.md)を参照してください。

主要な実装は `src/experiments/double-auction/lib/study-core.ts`（ルール）、`study-view.ts`（表示・統計）、`study-export.ts`（出力）、`src/experiments/double-auction/components/study-room.tsx`（画面）、`study-settings.tsx`（設定）です。写真の出典は [public/fruits/CREDITS.md](../../../public/fruits/CREDITS.md) に記載しています。

---

[ホーム](../../../README.md) · [授業での使い方](classroom.md) · [Double Auction](double-auction.md) · [Demo Model](demo.md) · [EMH 資産市場実験](emh.md) · [Judgement under Uncertainty](judgment.md)
