import Link from "next/link";

export function DemoEntryLink({ href }: { href: string }) {
  return (
    <Link className="button demo-entry-button" href={href}>
      Demo Model
    </Link>
  );
}
