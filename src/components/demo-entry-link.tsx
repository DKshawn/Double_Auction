import Link from "next/link";

export function DemoEntryLink() {
  return (
    <Link className="button demo-entry-button" href="/demo/select">
      Demo Model
    </Link>
  );
}
