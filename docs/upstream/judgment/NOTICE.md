# Judgment source archive

These files are verbatim from DKshawn/Exp-all-in-one at
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
