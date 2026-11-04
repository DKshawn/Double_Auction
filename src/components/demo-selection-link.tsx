import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function DemoSelectionLink() {
  return (
    <Link
      className="button secondary small-button"
      href="/demo/select"
      target="_top"
    >
      <ArrowLeft size={15} />
      戻る
    </Link>
  );
}
