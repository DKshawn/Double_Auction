import Link from "next/link";
import { ChartNoAxesCombined } from "lucide-react";

export function Shell({
  children,
  leading,
  wide = false,
  room = false,
}: {
  children: React.ReactNode;
  leading?: React.ReactNode;
  wide?: boolean;
  room?: boolean;
}) {
  return (
    <div className="emh-app">
      <header className={`site-header ${room ? "compact" : ""}`}>
        <div className="header-inner">
          <div className="header-left">
            <Link href="/" className="brand">
              <span className="brand-mark">
                <ChartNoAxesCombined size={22} strokeWidth={1.7} />
              </span>
              市場実験室
            </Link>
            {leading}
          </div>
          <nav aria-label="メインナビゲーション">
            {!room && (
              <>
                <Link className="button secondary small-button" href="/">
                  参加する
                </Link>
                <Link className="button secondary small-button" href="/teacher">
                  教員
                </Link>
              </>
            )}
            <Link
              className="button secondary small-button"
              href="/emh/guide"
              target={room ? "_blank" : undefined}
            >
              ルール{room && <span className="sr-only">（新しいタブ）</span>}
            </Link>
          </nav>
        </div>
      </header>
      <main className={wide ? "container wide" : "container"}>{children}</main>
      <footer className="site-footer">
        <span>実験経済学</span>
        <span>資産市場と情報</span>
      </footer>
    </div>
  );
}
