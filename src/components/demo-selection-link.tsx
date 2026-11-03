import Link from "next/link";

export function DemoSelectionLink() {
  return (
    <Link
      className="button secondary small-button"
      href="/demo/select"
      target="_top"
    >
      デモを選び直す
    </Link>
  );
}
