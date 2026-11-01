# Illustrated platform guide

[日本語](../ja/classroom.md) · [中文](../zh-CN/classroom.md) · [English](../en/classroom.md)

[Teacher entry](https://exp-all-in-one.vercel.app/teacher) · [Student entry](https://exp-all-in-one.vercel.app)

Create a room, bring students in, run the experiment, and download the results. Screenshots show a local sample classroom in the default Japanese interface; use the online entry links above for class. The creation and download panels use Double Auction as the example.

## 1. Choose an experiment and create a room

Open the teacher entry and select an experiment. All three experiments share this entry point and the saved-room list below it.

![Teacher entry: experiment cards above, teacher-key access to room management below](../images/teacher-entry.png)

Enter an experiment name, review the settings, set a room teacher password of at least eight characters, and enter the administrator-provided **教員用キー**. Click **ルーム作成** to open the teacher view.

![Room creation example: experiment name, room teacher password, teacher key, and create button](../images/create-room.png)

| Item                                   | Used by                             | Purpose                                                                                   |
| -------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| Teacher key — 教員用キー               | Teachers                            | Provided by the administrator for online room creation and the management list            |
| Room teacher password — 教員パスワード | Teacher                             | Set when creating a room; used to re-enter that room                                      |
| Room code — ルームコード               | Shared by the teacher with students | Identifies the classroom; it is separate from the teacher password                        |
| Four-digit PIN — 暗証番号              | Each student                        | Set by the student; restores their identity together with the same nickname or student ID |

Students need the student entry, room code, and their own entry details. Do not share the teacher key or room teacher password.

## 2. Share the entry and let students join

Share the six-character room code shown in the teacher view and the student entry with the class, or use the participation link offered on screen. In this example, **参加リンクをコピー** copies a link with the room code already filled in.

![Teacher controls example: room code, attendance, copy participation link, and Dashboard](../images/share-room.png)

Students open the link, check the code, enter a nickname and their own four-digit PIN, and click **入室する**. For Judgement under Uncertainty, the identity field is **学生証番号**: enter a seven-digit student ID, including leading zeros. Students do not select an experiment; the room code identifies it.

![Student entry example: room code, nickname, four-digit PIN, and join button](../images/student-join.png)

After joining, keep the page open and wait for the teacher to start. Students follow the conditions and tasks on their own screens, using the student entry rather than the teacher entry.

## 3. Check attendance and run the experiment

In the teacher view, check attendance and settings, complete the preparation shown for the selected experiment, and use its start control. Preparation, grouping, and start requirements differ between experiments. If the start button is missing or unavailable, complete the steps shown on screen first.

During the session, the teacher monitors overall progress and uses the selected experiment's pause, resume, or finish controls as needed. Students trade or answer tasks on their own screens. Check the class's progress before finishing, and read any confirmation dialog before proceeding.

## 4. Download results and keep the room

Choose the files you need in the teacher view's download area. Double Auction opens the panel below through **Dashboard**. Other experiments have their own export controls; file formats and fields depend on the experiment.

![Double Auction Dashboard download area: CSV records and JSON settings](../images/download-results.png)

In Double Auction, attempting to download records that do not exist yet shows a no-data message. Use the saved files for classroom discussion and analysis. Saved rooms remain accessible through the teacher entry. Download any required data before deleting a room.

## Re-entry and room management

| Task                                                       | Action                                                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Teacher returns to a room                                  | Click **教員として再入室** and enter the room code and the teacher password set at creation                                                      |
| Student returns after closing the page or changing devices | Open the student entry with the same code, nickname or student ID, and original PIN                                                              |
| Find an earlier room                                       | Under **ルーム管理**, enter the teacher key and click **ルームを表示**; search by experiment name or code, or filter by creation year and status |
| View saved results                                         | In the list, click **結果・ダウンロード / 再入室** or **再入室**, then enter that room's teacher password                                        |

Login state is scoped by room and role. Ordinary tabs in one browser can show the teacher and student views together. To simulate multiple students, use a separate device or browser profile for each.

Rooms appear newest first, with experiment name, code, creation time, status, market count, attendance, progress, and periods per institution. Load another 20 entries at a time. There are no personal teacher accounts: online creation and management use a shared teacher key. Locally, the list shows rooms in the database selected on that computer.

To delete a room, click **このルームを削除** in its confirmation dialog. The room teacher password is not requested again, but the server still checks the management list's teacher key, except in local environments without a configured key. Deletion also removes participants, markets, trading history, audit logs, and results; active students can no longer use that room. Deletion cannot be undone.

## Try it before class

After selecting an experiment, use **Demo Model** at the top right of the teacher page without a teacher key or room creation. The entries are [Double Auction](https://exp-all-in-one.vercel.app/demo), [EMH](https://exp-all-in-one.vercel.app/emh/demo), and [Judgement under Uncertainty](https://exp-all-in-one.vercel.app/judgment/demo). The Judgement demo starts after selecting tasks; answers are not saved and time limits are paused. See [Using Demo Model](demo.md) for details.

The old `doubleauction.vercel.app` address redirects to the new address while preserving the path and query. Anyone who previously joined through the old address needs to re-enter once at the new address.

---

[Home](../../../README.en.md) · [Double Auction](double-auction.md) · [Demo Model](demo.md) · [EMH asset market experiment](emh.md) · [Judgement under Uncertainty](judgment.md) · [Development, deployment and verification](development.md)
