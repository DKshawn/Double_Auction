import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DEMO_SELECTION_HREF } from "@/lib/demo-navigation";

export function DemoSelectionLink() {
  return (
    <Link
      className="button secondary small-button"
      href={DEMO_SELECTION_HREF}
      target="_top"
    >
      <ArrowLeft size={15} />
      戻る
    </Link>
  );
}
