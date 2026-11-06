import { requireTeacherPage } from "@/lib/server/teacher-page-access";
import type { Metadata } from "next";
import { DemoPreview } from "@/experiments/double-auction/components/demo-preview";

export const metadata: Metadata = {
  title: "EMH 画面サイズ別デモ | 市場実験室",
};

export default async function EmhDemoPreviewPage() {
  await requireTeacherPage("/emh/demo/preview");
  return <DemoPreview experiment="emh" />;
}
