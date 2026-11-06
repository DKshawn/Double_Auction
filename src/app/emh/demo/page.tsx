import { requireTeacherPage } from "@/lib/server/teacher-page-access";
import { Demo } from "@/experiments/emh/components/demo";
export default async function DemoPage() {
  await requireTeacherPage("/emh/demo");
  return <Demo />;
}
