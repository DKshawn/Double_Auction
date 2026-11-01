Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.

Do not add meaningless arrows. Use arrows only when they communicate a clear direction, relationship, or action.

Keep the color palette consistent with DoubleAuction: blue-purple primary, cool gray backgrounds, teal for buying, and warm orange for selling. Reuse the shared color tokens in `src/app/globals.css`.

The maintained platform checkout is `Exp-all-in-one`, matching `DKshawn/Exp-all-in-one`. Run development and release commands from this repository root and use repository-relative paths in scripts. `DoubleAuction` names an experiment module. The sibling `../EMH` directory retains original materials and the standalone source.

Keep released experiments together on `main`, in `src/experiments/double-auction`, `src/experiments/emh`, and `src/experiments/judgment`. Shared entry, room management, sessions, UI tokens, and database connections belong to the platform layer. Develop on short-lived feature branches and merge after validation; do not maintain a permanent branch per experiment. Preserve migration provenance and existing experiment data.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
