import Link from "next/link";

export function DemoExitLink({
  label = "DEMOモードを終了",
}: {
  label?: string;
}) {
  return (
    <Link
      className="button secondary small-button demo-exit"
      href="/"
      target="_top"
    >
      {label}
    </Link>
  );
}
