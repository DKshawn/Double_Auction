# Judgment source archive

These files are verbatim from the original standalone DKshawn/Exp-all-in-one
(GitHub repository ID `1435420427`) at
`bd28b3460366671917b477d590c2be0a274f867b`. `manifest.json` records SHA-256 hashes.
The three original READMEs document study sources, reconstructed methods and
limitations. They describe the historical SQLite application, not platform setup.

Original tests are retained here as migration evidence. Tests using the old SQLite
Store or standalone HTTP server are not platform tests. Their replacement is
`tests/judgment-platform.test.ts`, including 56 fixed upstream protocol hashes,
and `scripts/verify-judgment-http.ts` for complete classroom HTTP flows.

The source revision does not declare a project-wide software license. No new
license is granted by this migration. Preserve authorship and study citations.
The bundled Noto Sans JP font has a separate SIL Open Font License 1.1, retained
at `public/fonts/noto-sans-jp/LICENSE`. The platform uses its shared font stack;
unused source font binaries and the old admin UI are not included at runtime.
The original favicon is retained as a reference asset. Question text, translations,
stimulus generation and controls are in `src/experiments/judgment/vendor`.

The unified platform now uses the old repository name; it is a different GitHub
repository (ID `1389400487`). `manifest.json` identifies the historical source.
`migration-20261101.md` preserves the later archival notice verbatim from
`4574849f751f00f9457b4612eb02cb63864cc728`; its URLs describe the names at that
time. See [the rename record](../../releases/repository-rename.md) for the
current repository and backup disposition.
