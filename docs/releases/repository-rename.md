# Unified platform repository rename

The owner requested the unified name on 2026-11-01 (Asia/Tokyo), after the
three-experiment migration and production verification were complete.

## Maintained platform

- Repository: https://github.com/DKshawn/Exp-all-in-one
- Previous name: `DKshawn/Double_Auction`
- GitHub repository ID: `1389400487`, unchanged by the rename
- Main at rename: `73615a6787d20dd955c3c117029950fe7c757c0e`, preserved
- Teacher entry: https://doubleauction.vercel.app/teacher
- Student entry: https://doubleauction.vercel.app
- Vercel project: `double_auction` (`prj_QxEwAY8jf0SBexUkclptvR9xMT4f`)

The platform retains its commits, pull requests, issues and CI history. The local
platform `origin` now uses the new repository URL. The Vercel project and Neon
database remain the existing resources. All three experiments remain on `main`;
DoubleAuction is still the name of one experiment module.

## Retired Judgment source

The standalone Judgment source was a different repository, ID `1435420427`,
previously named `DKshawn/Exp-all-in-one`. Its pinned migration source remains
`bd28b3460366671917b477d590c2be0a274f867b`; its final main is
`4574849f751f00f9457b4612eb02cb63864cc728`.

The current GitHub credential cannot delete that repository: the DELETE API
returned HTTP 403. It was therefore renamed to `DKshawn/Exp-all-in-one-legacy`
and returned to read-only archival, freeing the requested platform name.
**Deletion remains pending owner action; it is not reported as complete.**

Before any repository change, the complete Git history was mirrored and verified
with `git bundle verify`. The local retirement backup contains:

- `EMH/backups/judgment-retired-20261101/Exp-all-in-one-legacy.bundle`
- Bundle SHA-256: `4f2b721c0c783c02ad7000f1e70726650c6ff3f72f912cd331ee476d4fba21d0`
- `github-metadata.json`: repository metadata and the single merged PR, with its
  comments/reviews; tags and releases were empty
- Repository identity receipts for the legacy and platform renames

The archived clone and original local Judgment checkout now fetch from the local
bundle and have a disabled push target. This avoids accidentally pushing the old
code to the reused platform URL. Their source files and uncommitted edits remain
unchanged. The original migration notice is also preserved at
[`docs/upstream/judgment/migration-20261101.md`](../upstream/judgment/migration-20261101.md).

Original source files and their file hashes remain in `docs/upstream/judgment`.
Its manifest includes the historical repository ID to distinguish it from the
current platform. Runtime behavior, experiment data and deployment credentials
are unaffected by these documentation and repository-name changes.
