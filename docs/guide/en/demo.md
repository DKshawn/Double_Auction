# Demo Model

[日本語](../ja/demo.md) · [中文](../zh-CN/demo.md) · [English](../en/demo.md)

After signing in, open **Demo Model** at the top right of the teacher page. Opening the public demo URLs below directly requires no login and creates no production room.

## Double Auction

Open [`/demo`](https://exp-all-in-one.vercel.app/demo) directly or choose **Demo Model** on the teacher page. No login is required. It starts with the same settings form used for production experiments. The defaults are one market and 16 participants; institutions, periods per institution, markets, participants, and timing are configurable using the same validation rules as room creation.

1. **デモルームを作成** opens a teacher view containing you and virtual participants. Use **作成前に詳細を設定** for detailed configuration before creation. Before starting, **実験設定を変更** can change institutions, periods, timing, values, and costs.
2. Close admission with **入室を締め切って割り当て** or the admission timer to allocate actual participants to markets and buyer/seller roles. **実験を開始** begins a five-second countdown before trading. **学生画面を見る** shows the transition from waiting to trading.
3. Each selected institution runs for its configured number of periods. CDA trades through the order book; Call clears public orders together at the deadline; Posted lets all buyers purchase directly at sellers' published prices.
4. **教員画面を見る** shows all-market results and both sides' orders, conditions, and profits for the selected market. The teacher view always displays both sides; roles cannot be switched there.
5. **一時停止** stops every market clock and virtual participant. **30秒進める** advances time while processing clearings and purchases. The last period of each institution has an eight-second results view before advancing, and the demo ends after the configured total periods. Switching to the teacher view does not place orders or make purchases on your behalf.
6. **実験設定に戻る** returns to the settings form with the previous institutions, periods, participant count, and timing preserved, ready to adjust and create a new demo.

The demo uses production matching, clearing, inventory, and profit calculations, but has demo-specific initial values and costs. Changing attendance samples or duplicates conditions using the production method. In CDA, the first three seconds of each period allow time to think; virtual buyers and sellers then submit orders every two seconds, initially leaving a larger profit margin and gradually reducing it. Call and Posted use fixed margins. These behaviors do not model human learning or price convergence.

State exists only in browser memory, with no writes to APIs, cookies, or Neon. Reloading returns to the initial settings screen. Changing roles or selecting **やり直す** resets progress with the configured composition. Progress pauses in background tabs.

### Screen-size preview

Open [`/demo/preview`](https://exp-all-in-one.vercel.app/demo/preview), or the link under **デモについて**, for an interactive laptop-size preview. Five presets cover 1366×768 at 100%, 1920×1080 at 125%, 150%, and 100%, and a 14-inch MacBook Pro at 1512×982 with Retina 2×. Optionally subtract 120 CSS px for browser and operating-system bars.

The MacBook Pro preset converts 3024×1964 physical pixels to logical dimensions at 2×, giving 1512×862 CSS px after the reserved height. Actual browser and system overhead varies. A single fixed-size iframe displays `/demo`, so changing dimensions does not reload the demo or discard trading or teacher-view state. **全体に合わせる** scales only the outer display; **原寸** displays at 100%. The viewport dimensions and preview scale are both shown. Only same-origin `/demo` embedding is allowed; teacher and production experiment pages remain protected against embedding.

The preview also starts with the teacher settings form. After creation, start, pause, reset, role selection, and return-to-settings controls sit outside the frame, preserving the experiment's display height. A same-origin React Portal controls the same demo session. Ordinary `/demo` keeps its control panel inside the page.

## EMH

[EMH Demo Model](https://exp-all-in-one.vercel.app/emh/demo) uses the same settings form, validation limits and defaults as the formal experiment. Set initial securities, target size, type ratios and A/B period duration, then choose **デモルームを作成**. It creates one market of 3–12 participants; everyone except you is virtual, with eight virtual participants by default.

Saving settings during admission, confirming and locking allocation, and explicitly releasing it before starting follow the formal workflow. Starting does not redraw confirmed types. There are six rounds, trade attempts of at most 30 seconds and 60-second breaks. Securities, timing, payouts and efficiency use the shared engine. Practice A/B dividends for types 1–3 are 120/40, 100/60 and 150/30; private classroom dividends are not used.

**設定を見直す** restores the currently saved settings to the form and resets progress when another demo room is created. Reloading returns to the default settings page. State remains in browser memory, with no production room or Neon writes. See the [formal experiment conditions](emh.md).

## Judgement under Uncertainty

[Judgement Demo Model](https://exp-all-in-one.vercel.app/judgment/demo) previews the student screens after task selection. Circular **i** buttons open task details. The preview does not save answers and pauses time limits. Use the isolated local verification flow to check production timing and answer persistence.

---

[Home](../../../README.en.md) · [Classroom guide](classroom.md) · [Double Auction](double-auction.md) · [EMH asset market experiment](emh.md) · [Judgement under Uncertainty](judgment.md) · [Development, deployment and verification](development.md)
