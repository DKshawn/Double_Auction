# Teacher management UI migration

Source: `legacy/teacher-management-update`, commit
[`1a90709c69e7f30f636a915568c3ba18ad2bf437`](https://github.com/DKshawn/Exp-all-in-one/commit/1a90709c69e7f30f636a915568c3ba18ad2bf437).
This is the later standalone Judgment teacher UI, developed after the original
platform migration. Its Git history is independent of the platform's history.
The files listed in [manifest.json](manifest.json) are byte-for-byte source copies.
They are historical references, not a second runnable application.

The port adapts the selected design A to the platform's React components:

- Selectable task cards, a selected-task count/list, and a sticky desktop control
  panel. On small screens controls appear above the cards.
- Japanese, Chinese and English teacher controls, with Japanese as the initial
  default and the teacher language remembered in this browser. Previews start in
  that language through an optional initialLanguage argument on the React host
  and original renderer; formal student sessions keep their own language.
- Shared controls for room creation, live teacher management and the solo demo.
  Circular information dialogs remain available even while settings are locked.
- Live progress, confirmed ending, preview navigation and CSV/JSON downloads use
  the platform's existing scoped room API, shared login and PostgreSQL service.

The standalone SQLite server, global classroom, `/admin` redirect and app-wide
CSS are not brought into production. Task content, randomization, protocol
hashes, timing and response storage still come from the original pinned task
revision in [UPSTREAM.md](../../../../src/experiments/judgment/UPSTREAM.md).
Existing platform rooms and records need no data migration.

The source still declares no project-wide license; this port does not relicense
it. Existing third-party notices remain in [NOTICE.md](../NOTICE.md).

Validation is recorded in the port pull request. The automated browser scenario
is `tests/e2e/judgment-teacher.spec.ts`; it covers all-language selection/details,
responsive controls, a real lesson, locked settings, refresh, duplicate answer
submission, end cancellation/confirmation, actual downloads and a subsequent run.
It deletes its own test room. The archived implementation-verification.md records
checks of the old standalone app only, not checks of the new platform.
