# Unified platform migration

## Source and destination

- Maintained repository: https://github.com/DKshawn/Double_Auction
- Vercel project: `double_auction`
- Production entry: https://doubleauction.vercel.app
- Judgment source: https://github.com/DKshawn/Exp-all-in-one
- Source commit: `bd28b3460366671917b477d590c2be0a274f867b`
- Source documents, tests and license notices: `docs/upstream/judgment/manifest.json`

The current release integrates DoubleAuction, EMH and Judgment on `main` after
verification. The URL above is the configured production entry; release and
post-deployment verification results are recorded separately below when completed.

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

Pending release verification. Do not treat this record as a completed deployment
or archive until actual commit/deployment IDs and outcomes are added.
