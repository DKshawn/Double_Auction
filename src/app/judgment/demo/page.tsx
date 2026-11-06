import { requireTeacherPage } from "@/lib/server/teacher-page-access";
import { JudgmentDemoEntry } from "@/experiments/judgment/components/demo-entry";
import { studies } from "@/experiments/judgment/server/core";

export default async function JudgmentDemoPage() {
  await requireTeacherPage("/judgment/demo");
  return <JudgmentDemoEntry studies={studies} />;
}
