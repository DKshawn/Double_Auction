import Link from "next/link";

export function DemoExitLink({
  label = "DEMOモードを終了",
  href = "/teacher",
}: {
  label?: string;
  href?: string;
}) {
  return (
    <Link
      className="button secondary small-button demo-exit"
      href={href}
      target="_top"
    >
      {label}
    </Link>
  );
}
