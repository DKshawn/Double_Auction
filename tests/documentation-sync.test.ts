import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  checkDocumentationSync,
  compareCommits,
  summaryMarkdown,
  warningAnnotation,
} from "../scripts/check-docs-sync.mjs";

const languages = ["ja", "zh-CN", "en"];
const readmes = ["README.md", "README.zh-CN.md", "README.en.md"];
const guides = (topic: string) =>
  languages.map((lang) => `docs/guide/${lang}/${topic}.md`);
const baseline = [
  ...readmes,
  ...[
    "classroom",
    "double-auction",
    "emh",
    "judgment",
    "demo",
    "development",
  ].flatMap(guides),
];
const check = (changedPaths: string[], headFiles = baseline) =>
  checkDocumentationSync({ changedPaths, headFiles });

for (const experiment of ["double-auction", "emh", "judgment"]) {
  test(`${experiment} code without documentation identifies every missing language`, () => {
    const warnings = check([`src/experiments/${experiment}/server/core.ts`]);
    assert.deepEqual(
      new Set(warnings.map((warning) => warning.group)),
      new Set(["README", `${experiment}.md`]),
    );
    assert.ok(warnings.every((warning) => warning.missing.length === 3));
  });
}

test("updating Japanese and Chinese only identifies the exact English counterparts", () => {
  const warnings = check([
    "src/experiments/judgment/components/settings-fields.tsx",
    ...readmes.slice(0, 2),
    ...guides("judgment").slice(0, 2),
  ]);
  assert.deepEqual(
    warnings
      .flatMap((warning) => warning.missing.map((item) => item.path))
      .sort(),
    ["README.en.md", "docs/guide/en/judgment.md"].sort(),
  );
  assert.ok(
    warnings.every((warning) =>
      warning.missing.every(
        (item) => item.language === "en" && item.state === "unchanged",
      ),
    ),
  );
});

test("complete matching translations clear a reminder, but another topic cannot substitute", () => {
  const feature = ["src/experiments/emh/server/core.ts", ...readmes];
  assert.equal(check([...feature, ...guides("emh")]).length, 0);
  assert.equal(check([...feature, ...guides("judgment")])[0].group, "emh.md");
});

test("a document-only update checks its own translations without inventing feature changes", () => {
  const warnings = check(["docs/guide/ja/emh.md"]);
  assert.deepEqual(
    warnings.map((warning) => warning.group),
    ["emh.md"],
  );
  assert.deepEqual(
    warnings[0].missing.map((item) => item.language),
    ["zh-CN", "en"],
  );
  assert.equal(check(guides("emh")).length, 0);
});

test("test-only, agent-instruction, and upstream archive changes do not require current guides", () => {
  assert.equal(
    check([
      "tests/emh-engine.test.ts",
      "tests/e2e/classroom.spec.ts",
      "src/lib/example.test.ts",
      "src/lib/types.d.ts",
      "AGENTS.md",
      "docs/architecture.md",
      "docs/upstream/judgment/README.md",
      "src/experiments/judgment/UPSTREAM.md",
      "material/README.md",
    ]).length,
    0,
  );
});

test("demo routes and experiment APIs select their corresponding guide", () => {
  const warnings = check([
    "src/app/demo/preview/page.tsx",
    "src/app/api/rooms/[code]/judgment/export/route.ts",
    ...readmes,
  ]);
  assert.deepEqual(
    new Set(warnings.map((warning) => warning.group)),
    new Set(["double-auction.md", "demo.md", "judgment.md"]),
  );
});

test("shared entry, database, and deployment changes include the relevant common guides", () => {
  const warnings = check([
    "src/components/join-form.tsx",
    "src/lib/server/database.ts",
    ".github/workflows/verify.yml",
    "package.json",
    ...readmes,
  ]);
  assert.deepEqual(
    new Set(warnings.map((warning) => warning.group)),
    new Set(["classroom.md", "development.md"]),
  );
});

test("new guide topics report versions that do not exist yet", () => {
  const added = "docs/guide/ja/new topic.md";
  const warnings = check([added], [...baseline, added]);
  assert.equal(warnings[0].group, "new topic.md");
  assert.deepEqual(
    warnings[0].missing.map((item) => [item.language, item.state]),
    [
      ["zh-CN", "missing"],
      ["en", "missing"],
    ],
  );
});

test("deleting one language cannot count as a successful synchronized update", () => {
  const missingFile = "docs/guide/en/emh.md";
  const warnings = check(
    guides("emh"),
    baseline.filter((path) => path !== missingFile),
  );
  assert.deepEqual(warnings[0].missing, [
    { language: "en", path: missingFile, state: "missing" },
  ]);
});

test("retiring or renaming every translation together is allowed, but partial renames warn", () => {
  const retired = guides("emh");
  const remaining = baseline.filter((path) => !retired.includes(path));
  assert.equal(check(retired, remaining).length, 0);
  const renamed = guides("asset-market");
  assert.equal(
    check([...retired, ...renamed], [...remaining, ...renamed]).length,
    0,
  );
  const partial = check(
    [retired[0], renamed[0]],
    [...baseline.filter((path) => path !== retired[0]), renamed[0]],
  );
  assert.deepEqual(
    new Set(partial.map((warning) => warning.group)),
    new Set(["emh.md", "asset-market.md"]),
  );
  assert.equal(
    check(
      readmes,
      baseline.filter((path) => !readmes.includes(path)),
    )[0].missing.length,
    3,
  );
});

test("annotations and summaries safely render unusual Git filenames", () => {
  const name = "odd,|`<name>%\n::error::injected.md";
  const warnings = check(
    [`docs/guide/ja/${name}`],
    [...baseline, ...languages.map((lang) => `docs/guide/${lang}/${name}`)],
  );
  const annotation = warningAnnotation(warnings[0]);
  assert.ok(annotation.startsWith("::warning file="));
  assert.equal(annotation.includes("\n"), false);
  assert.ok(annotation.includes("%2C"));
  assert.ok(annotation.includes("%0A"));
  const summary = summaryMarkdown(warnings);
  assert.ok(summary.includes("&#124;"));
  assert.ok(summary.includes("&lt;name&gt;"));
  assert.equal(summary.includes("\n::error::"), false);
});

test("Git comparison covers all PR commits, excludes base-only edits, and CLI warnings stay non-blocking", (t) => {
  const parent = realpathSync(tmpdir());
  const cwd = mkdtempSync(join(parent, "docs-sync-test-"));
  t.after(() => {
    const actual = realpathSync(cwd);
    assert.equal(dirname(actual), parent);
    assert.ok(basename(actual).startsWith("docs-sync-test-"));
    rmSync(actual, { recursive: true, force: true });
  });
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Documentation test",
        "-c",
        "user.email=docs-test@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "-c",
        `core.hooksPath=${join(cwd, "disabled-hooks")}`,
        ...args,
      ],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text, "utf8");
  };
  const commit = (message: string) => {
    git("add", ".");
    git("commit", "-qm", message);
  };
  git("init", "-q", "-b", "main");
  for (const path of baseline) put(path, "original\n");
  commit("initial");
  git("checkout", "-qb", "feature");
  put("src/experiments/emh/server/core.ts", "export const rounds = 6;\n");
  commit("code");
  for (const path of [...readmes.slice(0, 2), ...guides("emh").slice(0, 2)])
    put(path, "translated\n");
  commit("Japanese and Chinese docs in a later commit");
  git("checkout", "-q", "main");
  put("README.en.md", "unrelated base branch change\n");
  commit("base moved");
  const comparison = compareCommits({ base: "main", head: "feature", cwd });
  assert.ok(
    comparison.changedPaths.includes("src/experiments/emh/server/core.ts"),
  );
  assert.ok(comparison.changedPaths.includes("README.zh-CN.md"));
  assert.equal(comparison.changedPaths.includes("README.en.md"), false);
  const warnings = checkDocumentationSync(comparison);
  assert.deepEqual(
    warnings
      .flatMap((warning) => warning.missing.map((item) => item.path))
      .sort(),
    ["README.en.md", "docs/guide/en/emh.md"].sort(),
  );
  const script = fileURLToPath(
    new URL("../scripts/check-docs-sync.mjs", import.meta.url),
  );
  const summary = join(cwd, "summary.md");
  const env = {
    ...process.env,
    GITHUB_ACTIONS: "true",
    GITHUB_STEP_SUMMARY: summary,
  };
  const result = spawnSync(
    process.execPath,
    [script, "--base", "main", "--head", "feature"],
    { cwd, encoding: "utf8", env },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("::warning file=README.en.md"));
  assert.ok(readFileSync(summary, "utf8").includes("docs/guide/en/emh.md"));
  const invalid = spawnSync(
    process.execPath,
    [script, "--base", "does-not-exist", "--head", "feature"],
    { cwd, encoding: "utf8", env },
  );
  assert.equal(invalid.status, 1);
  assert.ok(
    invalid.stderr.includes("::error title=Documentation sync could not run"),
  );
});
