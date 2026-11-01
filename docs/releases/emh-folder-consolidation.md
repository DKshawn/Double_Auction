# EMH local folder consolidation

On 2026-11-01, the owner requested that useful materials and documents from the
standalone EMH directory be consolidated into the maintained platform.

| Content                                                          | Current location                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Both original course PDFs                                        | `material/emh/`                                                                     |
| Current EMH protocol and source-page references                  | `docs/experiments/emh.md`                                                           |
| Original README, agent guidance and source hashes                | `docs/upstream/emh/`                                                                |
| Standalone source, tests, configuration, data and migration work | `work/archives/emh-legacy-20261101/` (local only)                                   |
| Retired Judgment history bundle and metadata                     | `work/archives/emh-legacy-20261101/backups/judgment-retired-20261101/` (local only) |
| Active platform verification database                            | `.data/platform-verification/` (local only)                                         |

The experiment implementation remains in `src/experiments/emh`. Session6-1 is
retained as reference material; experiment 2 has not been implemented. The
standalone application is historical source, not another maintained runtime.

The local server is stopped before copying its database. A cold backup and a
new active copy are created, every copied file is checked by SHA-256, and the
existing room list is compared before and after restarting. Standalone EMH data are
archived separately and are not merged into the platform or Neon.

Local snapshots, credentials and data stay under ignored `work/` or `.data/`.
Original source documents are byte-preserved; their hashes are recorded in
`docs/upstream/emh/manifest.json`. Generated dependencies and build caches can be
recreated from the saved lockfiles and are not part of the source archive.

The old `EMH` directory retains the original files, with its README and agent
guidance pointing to the maintained platform. It is a legacy copy, not an active
project or required dependency. The current chat still uses it as its working
directory. No original files are deleted by this consolidation.

## Verification

- 5,577 non-generated legacy files were copied and verified by SHA-256. The
  original directory remains in place. Empty Git/database directories were
  preserved as well.
- The copied database and its cold backup matched the stopped original. After
  restart, all 11 existing local room summaries matched byte-for-byte.
- Teacher/student entries, all three demos and the local status API returned 200.
- The retired Judgment bundle still has SHA-256
  `4f2b721c0c783c02ad7000f1e70726650c6ff3f72f912cd331ee476d4fba21d0`;
  `git bundle verify` confirms complete history. The copied Git configurations
  fetch from the bundle's new local path and retain disabled push URLs.
- Local lint, formatting, type checking and production build passed; 405 tests
  passed with 3 optional local PostgreSQL tests skipped.
- Private files remain ignored by Git. Original source documents and PDFs have
  explicit Git attributes to preserve the bytes referenced by the manifest.

The private file inventory, cold backup and before/after room snapshots are
saved in the local archive. No Neon data or deployment credentials were changed.
