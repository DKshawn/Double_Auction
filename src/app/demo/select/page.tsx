import { requireTeacherPage } from "@/lib/server/teacher-page-access";
import { Header } from "@/components/shell";
import { ExperimentCards } from "@/components/experiment-cards";

export default async function DemoSelectionPage() {
  await requireTeacherPage("/demo/select");
  return (
    <>
      <Header demoLabel="DEMOモード" />
      <main className="teacher-hub-main">
        <h1>デモする実験を選ぶ</h1>
        <ExperimentCards mode="demo" />
      </main>
    </>
  );
}
