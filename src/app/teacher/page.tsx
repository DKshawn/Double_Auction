import { DemoEntryLink } from "@/components/demo-entry-link";
import { TeacherHub } from "@/components/teacher-hub";
import { TeacherReentry } from "@/components/teacher-reentry";
import { EmhCreateForm } from "@/experiments/emh/components/create-form";
import { JudgmentCreateForm } from "@/experiments/judgment/components/create-form";
import { studies } from "@/experiments/judgment/server/core";
import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { Header } from "@/components/shell";
import { TeacherForm } from "@/experiments/double-auction/components/teacher-form";
import { getServerStatus } from "@/lib/server/config";
import { pptStudySettings } from "@/experiments/double-auction/server/study";
import { teacherRoomHref } from "@/lib/room-navigation";

export default async function Teacher({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    legacy?: string;
    room?: string;
    experiment?: string;
  }>;
}) {
  const { code, legacy, room, experiment } = await searchParams;
  const returnRoom = room && /^[A-Z2-9]{6}$/.test(room) ? room : undefined;
  if (code !== undefined && !returnRoom) {
    return (
      <>
        <Header>
          <Link href="/">学生の入室画面</Link>
        </Header>
        <main className="teacher-hub-main">
          <Link href="/teacher">実験を選び直す</Link>
          <TeacherReentry key={code} initialCode={code} />
        </main>
      </>
    );
  }
  if (!code && !returnRoom && legacy !== "1" && experiment !== "institutions") {
    const demoHref =
      experiment === "emh"
        ? "/emh/demo"
        : experiment === "judgment"
          ? "/judgment/demo"
          : null;
    return (
      <>
        <Header homeHref="/teacher">
          {demoHref ? (
            <DemoEntryLink href={demoHref} />
          ) : (
            <Link href="/">学生の入室画面</Link>
          )}
        </Header>
        <main className="teacher-hub-main">
          {experiment === "judgment" ? (
            <>
              <Link href="/teacher">実験を選び直す</Link>
              <JudgmentCreateForm
                status={getServerStatus()}
                studies={studies}
              />
            </>
          ) : experiment === "emh" ? (
            <>
              <Link href="/teacher">実験を選び直す</Link>
              <EmhCreateForm status={getServerStatus()} />
            </>
          ) : (
            <TeacherHub status={getServerStatus()} />
          )}
        </main>
      </>
    );
  }
  return (
    <>
      <Header homeHref="/teacher">
        <DemoEntryLink href="/demo" />
      </Header>
      <main
        className={
          legacy === "1" ? "narrow-main" : "narrow-main teacher-setup-main"
        }
      >
        <Link className="back-link" href="/teacher">
          <ArrowLeft size={15} />
          実験を選び直す
        </Link>
        {returnRoom && (
          <Link className="back-link" href={teacherRoomHref(returnRoom)}>
            ルーム {returnRoom} に戻る
          </Link>
        )}
        <h1 className="eyebrow teacher-entry-heading">
          <GraduationCap size={18} />
          教員用ページ
        </h1>
        <TeacherForm
          initialCode={code}
          initialTab={returnRoom ? "manage" : undefined}
          status={getServerStatus()}
          legacy={legacy === "1"}
          conditionPreset={{
            label: "Default",
            settings: pptStudySettings(),
          }}
        />
      </main>
    </>
  );
}
