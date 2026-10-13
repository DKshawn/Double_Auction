import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";

export function Brand({
  homeHref = "/",
  onHome,
}: {
  homeHref?: string;
  onHome?: () => void;
}) {
  return (
    <Link
      href={homeHref}
      className="brand"
      aria-label="市場実験室 ホーム"
      onNavigate={
        onHome
          ? (event) => {
              event.preventDefault();
              onHome();
            }
          : undefined
      }
    >
      <span className="brand-mark">
        <ArrowLeftRight size={21} />
      </span>
      <span>
        <b>市場実験室</b>
        <small>ダブルオークション</small>
      </span>
    </Link>
  );
}

export function Header({
  children,
  homeHref,
  onHome,
}: {
  children?: React.ReactNode;
  homeHref?: string;
  onHome?: () => void;
}) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand homeHref={homeHref} onHome={onHome} />
        <div className="header-right">{children}</div>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <Link href="/guide">実験のルール</Link>
    </footer>
  );
}
export function Spinner() {
  return <span className="spinner" aria-label="読み込み中" />;
}
