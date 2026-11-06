import { requireTeacherPage } from "@/lib/server/teacher-page-access";
import { DemoEntry } from "@/experiments/double-auction/components/demo-entry";

export default async function DemoPage() {
  await requireTeacherPage("/demo");
  return <DemoEntry />;
}
