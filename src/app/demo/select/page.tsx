import { Header } from "@/components/shell";
import { ExperimentCards } from "@/components/experiment-cards";

export default function DemoSelectionPage() {
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
