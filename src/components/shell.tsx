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
      </span>
    </Link>
  );
}

export function Header({
  children,
  leading,
  homeHref,
  onHome,
  className,
}: {
  children?: React.ReactNode;
  leading?: React.ReactNode;
  homeHref?: string;
  onHome?: () => void;
  className?: string;
}) {
  return (
    <header className={`site-header${className ? ` ${className}` : ""}`}>
      <div className="header-inner">
        <div className="header-left">
          <Brand homeHref={homeHref} onHome={onHome} />
          {leading}
        </div>
        <div className="header-right">{children}</div>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <Link className="button secondary small-button" href="/guide">
        実験のルール
      </Link>
    </footer>
  );
}
export function Spinner() {
  return <span className="spinner" aria-label="読み込み中" />;
}
