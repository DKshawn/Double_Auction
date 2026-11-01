# Judgment migration record

Migration verified on 2026-11-01 (Asia/Tokyo).

## Destination

- Maintained repository: https://github.com/DKshawn/Double_Auction
- Teacher entry: https://doubleauction.vercel.app/teacher
- Student entry: https://doubleauction.vercel.app
- Future development and issues: https://github.com/DKshawn/Double_Auction/issues
- Platform integration: https://github.com/DKshawn/Double_Auction/pull/1
- Released main commit: `a3e58870e02c6e5fec286f5398a7fb5df41085bf`
- Production deployment: `dpl_Crx3Uonny9ioT1qhfz9RKiKhTteH`

## Preserved source

The source revision is `bd28b3460366671917b477d590c2be0a274f867b`.
The maintained module is `src/experiments/judgment`; its `UPSTREAM.md` documents
runtime adaptations. The new repository retains the question catalog, condition
generators, ordering, timing, translations, controls and export semantics.
Original READMEs, methods/audit documents, test sources, reference assets and
font license notices are retained in `docs/upstream/judgment` with SHA-256 hashes.
The source has no project-wide license; the migration does not add one.

## Verification

- Local suite: 401 passed, 3 optional local PostgreSQL tests skipped, 0 failed.
- Type generation/typecheck, lint, formatting and production build passed locally
  and in the integration PR's GitHub Actions run.
- Vercel preview built successfully. The production deployment and public domain
  were checked against the released main commit.
- Production Judgment HTTP flow completed all 14 enabled studies and 86 pages;
  verified role isolation, same-origin checks, replay handling, translated
  presentation records, CSV/JSON exports and teacher/student reentry.
- Production browser flow created a room, joined with a seven-digit ID, switched
  to English, restored progress after refresh, completed the five-second task,
  downloaded CSV, and ended the lesson while retaining all three saved pages.
- Production EMH completed automatic groups of 7 and 7, a trade, all six rounds,
  condition reveal and exports. DoubleAuction allocation, countdown, trade,
  duplicate request, reentry, settlement and exports also passed.
- Existing production data was backed up first. Every original row in all seven
  auction tables, including the five existing rooms, was preserved unchanged.

The owner confirmed that there is no active legacy website or experiment to
continue, and that old SQLite data need not be imported. Local uncommitted work
was backed up and remains untouched. No private data or credentials are in Git.

## Historical repository

This repository stops accepting development and is retained read-only after
the migration checks. The original source commit remains an ancestor of the
archival documentation commit. No code, history, tags or releases are removed;
there were no tags or published releases at migration time.
