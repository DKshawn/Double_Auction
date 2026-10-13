import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  teacherRoomHref,
  teacherReentryHref,
  teacherSetupHref,
  roomNavigation,
} from "../src/lib/room-navigation";
import { StudyRoom } from "../src/components/study-room";
import { Header } from "../src/components/shell";
import { DemoSession } from "../src/lib/demo";
import { ExportDownloads } from "../src/components/export-downloads";
import { EXPORTS, isExportKind } from "../src/lib/exports";
import { csv } from "../src/lib/server/export";

test("room navigation retains teacher context, respects authenticated students, and recovers expired teacher sessions", () => {
  assert.equal(teacherRoomHref("ABCD23"), "/room/ABCD23?entry=teacher");
  assert.equal(teacherSetupHref("ABCD23"), "/teacher?room=ABCD23");
  assert.equal(teacherReentryHref("ABCD23"), "/teacher?code=ABCD23");
  assert.equal(teacherSetupHref("//other.example"), "/teacher");
  assert.equal(
    roomNavigation("ABCD23", "teacher").homeHref,
    "/teacher?room=ABCD23",
  );
  assert.equal(roomNavigation("ABCD23", "buyer", "teacher").teacher, false);
  assert.equal(roomNavigation("ABCD23", "seller", "teacher").homeHref, "/");
  assert.equal(
    roomNavigation("ABCD23", undefined, "teacher").recoveryHref,
    "/teacher?code=ABCD23",
  );
  assert.equal(roomNavigation("ABCD23").homeHref, "/");
  assert.match(renderToStaticMarkup(createElement(Header)), /href="\/"/);
});

test("formal teacher and demo brands lead to their settings, with current-room CSV entry", () => {
  const session = new DemoSession("call", "buyer", 1000);
  session.toggleTeacher();
  const snapshot = session.getSnapshot();
  snapshot.view = { ...snapshot.view, code: "ABCD23" };
  const props = {
    ...snapshot,
    disabled: false,
    connected: true,
    error: "",
    notice: "",
    retry: () => {},
    command: session.command,
  };
  const formal = renderToStaticMarkup(createElement(StudyRoom, props));
  assert.match(
    formal,
    new RegExp(`href="/teacher\\?room=${snapshot.view.code}"`),
  );
  assert.match(formal, /データをダウンロード/);
  const demo = renderToStaticMarkup(
    createElement(StudyRoom, { ...props, demo: true }),
  );
  assert.match(demo, /href="\/demo"/);
  assert.doesNotMatch(demo, /href="\/teacher/);
  session.toggleTeacher();
  const student = renderToStaticMarkup(
    createElement(StudyRoom, { ...props, ...session.getSnapshot() }),
  );
  assert.doesNotMatch(student, /教員の管理・設定へ|データをダウンロード/);
});

test("CSV preserves Japanese UTF-8/BOM and cell boundaries, neutralizes formulas without corrupting numeric losses", () => {
  const content = csv([
    ["氏名", "利益_円"],
    ['山田,"太郎"\n学生', -16],
    ['  =HYPERLINK("x")', 1],
    ["\t+1", 2],
    ["@SUM(1)", 3],
    ["-1", -1],
  ]);
  assert.deepEqual(
    [...Buffer.from(content).subarray(0, 3)],
    [0xef, 0xbb, 0xbf],
  );
  assert.equal(Buffer.from(content).toString("utf8"), content);
  assert.ok(content.includes('"山田,""太郎""\n学生","-16"'));
  assert.ok(content.includes('"\'  =HYPERLINK(""x"")"'));
  assert.ok(content.includes('"\'\t+1"'));
  assert.ok(content.includes('"\'@SUM(1)"'));
  assert.ok(content.endsWith('"\'-1","-1"'));
  assert.equal(content.split("\r\n").length, 6);
});

test("download UI reuses the four existing formats with explicit empty-data messages", () => {
  const html = renderToStaticMarkup(
    createElement(ExportDownloads, { code: "ABCD23" }),
  );
  for (const { kind, label, empty } of EXPORTS) {
    assert.ok(isExportKind(kind));
    assert.ok(html.includes(label));
    if (kind !== "settings") assert.ok(empty);
  }
  assert.ok(!isExportKind("xlsx"));
});
