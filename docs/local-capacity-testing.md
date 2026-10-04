# ローカルの同期・負荷検証

この手順はローカルアプリ＋ローカルPostgreSQL専用です。VercelやNeonに要求を送りません。`load-local.ts` は外部URLを拒否し、`LOCAL_DATABASE_URL` もループバック以外を拒否します。`.env.local` にクラウド接続がある場合でも、以下の環境変数が優先されます。

## テスト用PostgreSQL

今回作成した独立コンテナは `double-auction-local-perf`、ポートは `127.0.0.1:55433` です。他プロジェクトのコンテナ・データは使いません。既存の場合は `docker start double-auction-local-perf` で再起動できます。

新しいPCで作成する場合のみ実行します。

```powershell
docker run --name double-auction-local-perf -e POSTGRES_USER=auction -e POSTGRES_PASSWORD=local-auction-only -e POSTGRES_DB=auction_local -p 127.0.0.1:55433:5432 -d postgres:17-alpine
```

このパスワードはローカル検証専用です。外部公開・本番利用はしません。コンテナを削除せず停止すれば、作成した検証ルームも残ります。

## アプリ

PowerShellで以下を設定します。PGliteは手軽な操作確認に残していますが、行ロックの並行動作の検証には実際のPostgreSQLを使います。

```powershell
$env:LOCAL_ONLY='1'
$env:LOCAL_DATABASE_URL='postgresql://auction:local-auction-only@127.0.0.1:55433/auction_local'
$env:DATABASE_URL=''
$env:REALTIME_DATABASE_URL=''
$env:TEACHER_ACCESS_KEY=''
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3200
```

2つ目のPowerShellでも同じ環境変数を設定し、ビルドを再実行せず `npm.cmd run start -- --hostname 127.0.0.1 --port 3201` を実行します。同じDBに対する別プロセスの通知を検証できます。

## 検証の実行

```powershell
$env:LOCAL_TEST_DATABASE_URL='postgresql://auction:local-auction-only@127.0.0.1:55433/auction_local'
npm.cmd run test:local-postgres
$env:LOCAL_LOAD_URLS='http://127.0.0.1:3200,http://127.0.0.1:3201'
$env:LOCAL_LOAD_SECONDS='330'
npm.cmd run test:load-local
```

負荷テストは新しい12市場のルームを作成し、192名の学生＋教員1名のSSE接続を維持します。CDAの再提示・約定、Callの非公開注文、Postedの提示・購入を各市場の段階に応じて送信します。約4分で接続を順次更新し、再接続時にスナップショットを受け取ります。終了時は進行中なら一時停止し、全員の増分適用結果をAPIの確定スナップショットと照合して、`work/local-load-report.json` に実測値を保存します。

`responseMs` は送信からHTTP応答まで、`fanoutToAll16Ms` は送信開始から同市場16人全員のSSE状態が応答バージョン以上になるまでです。データベースの処理時間だけの値ではありません。同一PC上の負荷生成・アプリ・DBを含むため、学校の回線・192台のブラウザーの描画・Vercel・Neonの性能は推定できません。

`LOCAL_LOAD_SECONDS=5400` で実時間90分の接続継続テストも実行できます。ただし実験は15期で終了するため、終了後の時間は接続維持が中心です。330秒の結果は90分の実時間検証を意味しません。

## 永続化と同期の構造

- `auction_rooms`: 設定、認証、参加者割当、教員操作。学生の通常注文では更新しません。
- `auction_markets`: 市場ごとの状態・バージョン・重複排除ID。学生操作は所属市場だけを排他ロックします。共通設定への共有ロックは市場間で共存し、教員の全体操作・入室は共通設定への排他ロックで調整します。
- `auction_events` / `auction_market_events`: 共通操作と市場別操作の監査記録。状態・重複排除ID・監査記録・変更通知を同一トランザクションで確定します。市場間の連番は独立し、イベントの識別には `(記録スコープ, 連番)` を使います。CSVにスコープを追加し、全体表示は日時で整列します。
- `LISTEN/NOTIFY`: ローカルPostgreSQLのコミット通知をアプリプロセス間で共有。通知にはルームコードと市場番号だけを入れ、非公開の注文や条件は入れません。通知が途切れた場合はバージョン照合・再接続で復旧します。
- SSE: 同じ市場の接続へ認可済み表示の差分を送信。初回・再接続・大きな変更ではスナップショット、通常は変更フィールドと追加履歴だけを送ります。5秒ごとのハートビート、15秒の無通信検出、切断時の低頻度再取得、送信バッファの上限があります。
- 学生に送る履歴も現在制度の5期に限定。累積利益とDBの全15期記録は維持。教員は全市場・全15期を取得します。

既存の実験1ルームは、初回アクセス時の排他トランザクションで市場別保存へ移行します。旧3商品ルームは従来の保存・ルールを維持し、同期だけSSEに対応します。

## クラウドで未確認の点

この変更をpush/deployしたり、Vercel/Neonで負荷テストしたりする操作は、このローカル検証には含みません。オンラインで即時のDB通知を使う場合は、`REALTIME_DATABASE_URL` にLISTEN可能な直接接続を別途設定して確認する必要があります。未設定時は各アプリプロセスが各アクティブルームの小さなバージョン一覧を1秒ごとに確認し、変更だけをSSE配信します。これは直接通知と同じ遅延保証ではありません。SSEの接続時間・関数課金・DB接続数なども、実環境で別途確認します。
