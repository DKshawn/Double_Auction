import type { Metadata } from "next";
import { DemoPreview } from "@/components/demo-preview";

export const metadata: Metadata = {
  title: "画面サイズ別デモ | 市場実験室",
};

export default function DemoPreviewPage() {
  return <DemoPreview />;
}
