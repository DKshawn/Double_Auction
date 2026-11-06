import { requireTeacherPage } from "@/lib/server/teacher-page-access";
import type { Metadata } from "next";
import { DemoPreview } from "@/experiments/double-auction/components/demo-preview";

export const metadata: Metadata = {
  title: "画面サイズ別デモ | 市場実験室",
};

export default async function DemoPreviewPage() {
  await requireTeacherPage("/demo/preview");
  return <DemoPreview />;
}
