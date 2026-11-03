import Link from "next/link";
import { Header } from "@/components/shell";
import { ExperimentCards } from "@/components/experiment-cards";

export default function DemoSelectionPage() {
  return (
    <>
      <Header>
        <Link className="button secondary small-button" href="/">
          ホームへ
        </Link>
      </Header>
      <main className="teacher-hub-main">
        <h1>デモする実験を選ぶ</h1>
        <ExperimentCards mode="demo" />
      </main>
    </>
  );
}
