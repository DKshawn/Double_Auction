import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { DemoModeBadge } from "./demo-mode-badge";
import { DemoExitLink } from "./demo-exit-link";
import { DEMO_SELECTION_HREF } from "@/lib/demo-navigation";

export function Brand({
  homeHref = "/",
  onHome,
  demo = false,
}: {
  homeHref?: string;
  onHome?: () => void;
  demo?: boolean;
}) {
  return (
    <Link
      href={homeHref}
      className="brand"
      aria-label={demo ? "市場実験室 デモの実験選択" : "市場実験室 ホーム"}
      target={demo ? "_top" : undefined}
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
  demoLabel,
  demoExitLabel,
  demoExitHref,
}: {
  children?: React.ReactNode;
  leading?: React.ReactNode;
  homeHref?: string;
  onHome?: () => void;
  className?: string;
  demoLabel?: string;
  demoExitLabel?: string;
  demoExitHref?: string;
}) {
  return (
    <header className={`site-header${className ? ` ${className}` : ""}`}>
      <div className="header-inner">
        <div className="header-left">
          <Brand
            homeHref={demoLabel ? DEMO_SELECTION_HREF : homeHref}
            onHome={demoLabel ? undefined : onHome}
            demo={!!demoLabel}
          />
          {demoLabel && <DemoModeBadge label={demoLabel} />}
          {leading}
        </div>
        <div className="header-right">
          {children}
          {demoLabel && (
            <DemoExitLink label={demoExitLabel} href={demoExitHref} />
          )}
        </div>
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
