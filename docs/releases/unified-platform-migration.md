# Unified platform migration

## Source and destination

- Maintained repository: https://github.com/DKshawn/Exp-all-in-one
- Vercel project: `exp-all-in-one` (renamed from `double_auction` on 2026-11-01)
- Production entry: https://doubleauction.vercel.app
- Historical Judgment source: `DKshawn/Exp-all-in-one` (GitHub repository ID `1435420427`)
- Source commit: `bd28b3460366671917b477d590c2be0a274f867b`
- Source documents, tests and license notices: `docs/upstream/judgment/manifest.json`

DoubleAuction, EMH and Judgment are released together on `main`. The production
entry above was verified on 2026-11-01 (Asia/Tokyo).

## Data disposition

On 2026-11-01 the owner confirmed that no old Judgment website is active and no
old experiment needs to continue in the new platform. SQLite data are not imported.
Before edits, both working trees and 12 SQLite databases were backed up locally;
all backup table counts and SQLite integrity checks matched. The old working tree
contains unrelated uncommitted teacher UI changes, which remain untouched.
No participant data, database backups or secrets belong in Git.

Existing DoubleAuction production data must remain unchanged by the additive
module migrations. Verification uses new, clearly named rooms only.

## Archive gate

Update the old repository's README and description only after the replacement
entry passes actual teacher/student/export checks. Preserve its commit history,
tags and releases, then archive it read-only. The final archival commit links to
the maintained repository, production entry and new issue tracker.

## Release evidence

- Integration PR: https://github.com/DKshawn/Exp-all-in-one/pull/1
- Integration commit: `2880f817e7924cb33ae822a2a76abc4510fc1c51`
- Released main commit: `a3e58870e02c6e5fec286f5398a7fb5df41085bf`
- Preview deployment: `dpl_Fn5zNTemUB6KZkTD9LwrZWhYuNmy`, READY.
- Production deployment: `dpl_Crx3Uonny9ioT1qhfz9RKiKhTteH`, READY, `sin1`.
- Public production alias: https://doubleauction.vercel.app
- PR CI: https://github.com/DKshawn/Exp-all-in-one/actions/runs/41277402220
- Released main CI: https://github.com/DKshawn/Exp-all-in-one/actions/runs/41277602717

Both CI runs passed lint, formatting, type generation/typecheck, tests and build.
Local tests: 404 total, 401 passed, 3 optional loopback PostgreSQL tests skipped,
0 failed. The full production flows below used the actual Neon-backed APIs.

| Check                        | Actual result                                                                                                                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Teacher experiment selection | Three independent options rendered on the public production website                                                                                                                                                           |
| Judgment HTTP                | All 14 enabled studies / 86 pages saved; role isolation, same-origin enforcement, duplicate submission, translated presentation records, CSV/JSON and reentry passed                                                          |
| Judgment browser             | Created room, joined with seven-digit ID, started lesson, changed to English, refreshed and recovered page 2, completed five-second task, teacher saw 3/3 saved, downloaded four-line CSV, ended lesson with answers retained |
| EMH HTTP                     | Fourteen students in groups of 7 and 7, a trade, pause/resume, six rounds in both markets, reveal and CSV exports passed                                                                                                      |
| DoubleAuction HTTP           | Create, join, random allocation, five-second countdown, CDA trade, idempotent retry, student/teacher reentry, settlement and exports passed                                                                                   |
| Room management              | All experiments listed through shared management; the five exact agent-created verification rooms were removed after snapshots were saved                                                                                     |
| Existing data                | Every original row in all seven auction tables matched the pre-release backup; all five original rooms remained                                                                                                               |

After verification cleanup, original table counts were unchanged: 5 rooms,
10 markets, 335 room events, 4,459 market events and 1,281 order-history entries.
The original action-log and receipt tables remained empty. Data backups, private
verification snapshots and credentials are not committed.

## Completed archive at initial release

- Historical repository name: `DKshawn/Exp-all-in-one` (ID `1435420427`)
- Migration notice PR: historical repository PR #1, included in the local metadata backup
- Final main commit: `4574849f751f00f9457b4612eb02cb63864cc728`
- Saved record: [original migration notice](../upstream/judgment/migration-20261101.md)
- GitHub API confirmed `archived: true`; the public repository page displayed
  its read-only archive banner on 2026-11-01.

The three READMEs and repository description link to the maintained repository,
teacher/student entries and new issue tracker. The historical README generator
retains these notices; `npm run check` passed for all 32 JavaScript files, 21
catalog entries and three READMEs. Only documentation and its generator changed.
The pinned source remains an ancestor of final main, and runtime code is intact.
Tags and releases were empty before and after the initial archival.
The original local directory, including uncommitted teacher UI edits, was not
modified by the archival work; a separate checkout was used.

No legacy website needed redirection and no legacy SQLite records were imported,
as confirmed by the owner. All subsequent development and issue reporting belong
in the maintained repository.

## Subsequent repository naming decision

The owner subsequently requested deletion of the retired repository and reuse
of `Exp-all-in-one` for this unified platform. The maintained repository is
still ID `1389400487`; the Judgment source was a different repository.
See the [repository rename record](repository-rename.md) for the current
status and verified local history backup. Historical source URLs above
describe provenance and must not be confused with the new platform URL.
