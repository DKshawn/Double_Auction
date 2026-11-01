# Classroom guide

[日本語](../ja/classroom.md) · [中文](../zh-CN/classroom.md) · [English](../en/classroom.md)

[Teacher entry](https://exp-all-in-one.vercel.app/teacher) · [Student entry](https://exp-all-in-one.vercel.app)

## Shared entry points

The old `doubleauction.vercel.app` address redirects to the new address while preserving the path and query. Users who joined through the old address need to sign into their room once at the new address.

Use **Demo Model** at the top right of each experiment's teacher page to try it without a teacher key or room creation. Double Auction, EMH, and Judgement under Uncertainty use `/demo`, `/emh/demo`, and `/judgment/demo`, respectively. The Judgement demo starts after selecting tasks; its preview does not save answers and pauses time limits.

- Choose **Double Auction**, **EMH**, or **Judgement under Uncertainty** at `/teacher` and create a room. Saved rooms from all experiments share one management list.
- Students enter a room code, nickname, and four-digit PIN at `/`. For Judgement under Uncertainty, the name field changes to a seven-digit student ID. The platform identifies the experiment from the code and opens `/room/[code]`.
- Teacher re-entry and room management use the existing room password and teacher key. Teacher and student cookies are separate.
- Double Auction's detailed settings, institutions, demos, and existing rooms remain available.

## Re-entry and room management

Login cookies are scoped to a room and role. Ordinary tabs in the same browser can display teacher and student views at the same time. Use a separate device or browser profile for each student when simulating multiple students. Students set a four-digit numeric PIN on entry; re-entry restores the participant matching the nickname and PIN. A teacher cookie does not override the selected student.

The teacher page's **ルーム管理** lists saved rooms newest first, showing the experiment name, code, creation time, status, market count, attendance, progress, and periods per institution. Search by name or code, filter by creation year or status, and load another 20 entries at a time. **再入室** opens the teacher login with the code prefilled. There is no unified personal teacher account: the online list is protected by the shared teacher key. Locally, it lists rooms in the database selected on that computer.

Delete a room with **このルームを削除** on its confirmation page. Re-entering the room's teacher password is unnecessary, but the server still validates the management list's teacher key, except in local environments without a configured key. Participants, markets, trading history, audit logs, and results are deleted in one transaction, and active students are notified that the room no longer exists. Deletion cannot be undone; download any required results from the teacher view first.

---

[Home](../../../README.en.md) · [Double Auction](double-auction.md) · [Demo Model](demo.md) · [EMH asset market experiment](emh.md) · [Judgement under Uncertainty](judgment.md) · [Development, deployment and verification](development.md)
