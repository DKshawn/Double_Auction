# EMH asset market experiment

[日本語](../ja/emh.md) · [中文](../zh-CN/emh.md) · [English](../en/emh.md)

The implementation is in `src/experiments/emh/`, the rules page is `/emh/guide`, and `/emh/demo` provides practice with eight virtual participants. The source is Experiment 1 in [Session5-1（Exp1解説あり）.pdf](../../../material/emh/Session5-1（Exp1解説あり）.pdf). See the [protocol-to-source mapping (Japanese)](../../experiments/emh.md). Experiment 2 from Session6-1 is retained as reference material and is not implemented.

1. Set an experiment name and teacher password, create a room, and share the code with the class.
2. Once at least three students have joined, choose **受付を終了して自動分け** to close admission and randomly allocate everyone. The market count is based on attendance divided by nine, rounded to the nearest integer. Each market has 3–12 participants, with market sizes differing by at most one. The three types are balanced as closely as possible within markets and across the class. For example, 30 students form three markets of ten; 100 form one market of ten and ten markets of nine. Expected allocation is shown during admission, which can reopen only before the experiment starts. Registration is capped at 999 per room.
3. **全市場で実験を開始** starts all markets together. Trading, dividends, and clocks then progress independently by market. Teachers can switch markets, pause or resume all markets, and end the selected market's current period.
4. Each participant starts each round with two units; total supply is twice the market's attendance. Holdings carry from period A into B, and securities expire at the end of B. The next round resets initial holdings and trading cash flows while preserving cumulative scores. Maximum dividends and efficiency denominators reflect actual market size.
5. The fixed settings are six rounds, 240 seconds each for A and B, 30 seconds per trade attempt, and a 60-second break. Two consecutive failed attempts end the period. A/B dividends for types 1, 2, and 3 are 216/105, 200/110, and 257/83. These values are fixed in the current settings screen. Theoretical prices are 340/367 in A and 110 in B.
6. After the experiment, the teacher explicitly releases the explanation. Until then, students are not sent other types' dividends, other participants' results, or theoretical prices. Teachers can export a market-specific or all-market CSV; the latter includes market numbers. Conditions and allocations export as JSON. Student CSVs contain only their own history.

`lab_room_registry` keeps room codes unique across experiments. Alongside existing `auction_*` tables, EMH uses `emh_sessions`, `emh_markets`, `emh_command_receipts`, and `emh_login_attempts`. Connection-time migration creates these tables and registers existing codes; no additional connection string is needed. Market row locks, database time, and operation IDs handle retries, and state reads also process expired deadlines. Students receive only their market, while teachers receive the overview and selected market. Production dividend values stay in server-side files.

The integrated version has been checked locally and on Vercel + Neon; see the [migration and verification record](../../releases/unified-platform-migration.md). The old Judgment SQLite data was not imported. For local testing, set `LOCAL_ONLY=1` and a separate `PGLITE_DATA_DIR`, and clear `DATABASE_URL` and `LOCAL_DATABASE_URL`. Do not let multiple servers open the same PGlite database. The 999-person cap is a registration limit, not a guarantee of equivalent cloud concurrency.

With a local server running, use `npx tsx scripts/verify-emh-http.ts`. It defaults to `http://127.0.0.1:3200`; override it with `EMH_TEST_ORIGIN`. Use an isolated local database with no teacher key configured. The script creates test rooms.

`tests/emh-engine.test.ts` and `tests/emh-platform.test.ts` cover allocations across participant counts, parallel markets with 30 participants, private information, re-entry, retries and simultaneous trades, clocks, all six rounds, dividends, explicit explanation release, and shared room codes and management.

---

[Home](../../../README.en.md) · [Classroom guide](classroom.md) · [Double Auction](double-auction.md) · [Demo Model](demo.md) · [Judgement under Uncertainty](judgment.md) · [Development, deployment and verification](development.md)
