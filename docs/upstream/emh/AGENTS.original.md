Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.

Do not add meaningless arrows. Use arrows only when they communicate a clear direction, relationship, or action.

Keep the color palette consistent with DoubleAuction: blue-purple primary, cool gray backgrounds, teal for buying, and warm orange for selling. Reuse the shared color tokens in `src/app/globals.css`.

The maintained unified platform is in the sibling `../Exp-all-in-one` project, published at https://github.com/DKshawn/Exp-all-in-one. Read that project's AGENTS.md and installed Next.js documentation before platform changes. DoubleAuction, EMH, and Judgment are maintained together on main in independent experiment modules. This directory retains original materials and the standalone implementation; continue platform work in the maintained project instead of duplicating it here.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
