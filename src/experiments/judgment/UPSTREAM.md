# 判断ラボ source and integration

Original standalone source: `DKshawn/Exp-all-in-one`, GitHub repository ID
`1435420427`. That historical URL now identifies the unified platform
(repository ID `1389400487`), following the owner-requested rename on 2026-11-01.
The original files and source revision remain pinned below. See
[the rename record](../../../docs/releases/repository-rename.md) for provenance
and the verified local Git history backup.

Pinned revision: `bd28b3460366671917b477d590c2be0a274f867b` (v0.6.0).

`vendor/` contains the original task catalog, condition generators, validators,
analyses, translations, ranking control, five-second timer and debrief content.
Only the 14 tasks marked `classroomEnabled` can be selected. The other catalog
entries remain unavailable. Selecting all 14 produces 86 pages; internal trial
order and measurement scales remain unchanged.

Integration adaptations:

- `protocols.mjs` imports the catalog as JSON instead of reading a runtime file.
- `classroom.mjs` retains the pure `classroomProtocol` generator. SQLite room,
  login and run storage are replaced by the platform PostgreSQL service.
- `app.js` mounts inside a React host, uses the platform's scoped HttpOnly session
  cookie, and disposes timers/listeners on unmount. Local storage is scoped by
  room. It stores language, reload/timer state and retry payloads, never auth
  tokens. The original question renderer and response controls are retained.
- `ranking.js` places the drag ghost inside its host so scoped styles and modal
  previews work. Ranking semantics are unchanged.
- Task CSS is scoped to `.judgment-app` and uses the DoubleAuction color tokens.
  The original red/blue stimulus colors retain their meaning.
- A seven-digit student ID (including leading zeros) and a four-digit reentry PIN
  use the shared student entrance. Conversation partners still identify one
  another by their student IDs, with reciprocal matching within each lesson.

Each assignment stores its complete protocol, seeds, manifest, responses,
presentation timestamps and translation history. SHA-256 audit hashes use JSON
with recursively sorted object keys and unchanged array order, because PostgreSQL
`jsonb` reorders keys. JSON exports include all assigned protocols and the source
revision; CSV contains one row per saved response. JSON additionally includes
paired conversation results and lesson settings. No password/PIN/token hashes are
exported. Original SQLite history is not imported automatically.

`tests/fixtures/judgment-protocols.json` was generated from the pinned upstream
source for seeds 7 and 19 with choice randomization both on and off. The platform
tests compare the full generated protocols with these 56 fixed hashes and verify
authentication, isolation, retries, multi-lesson storage, timing and exports.

Original documentation, study citations, test sources and license notices are
preserved in `docs/upstream/judgment/` with a file-level hash manifest. The original
repository declared no project-wide license; this migration does not relicense it.
Unused local Noto font binaries are replaced by the platform's shared font stack.

The owner confirmed on 2026-11-01 that no legacy website or ongoing experiment
requires a cutover and that old SQLite data need not be imported. Existing local
source edits and SQLite files were backed up before release preparation. No
participant data or credentials are committed to either repository.

## Later teacher UI port

The teacher management layout was separately ported from
`legacy/teacher-management-update` at
`1a90709c69e7f30f636a915568c3ba18ad2bf437` on 2026-11-02. See the
[source copies, hashes and adaptation record](../../../docs/upstream/judgment/teacher-management-20261102/README.md).
This changes the teacher workspace, not the pinned task protocol revision above.
