import Link from "next/link";
import { ArrowLeftRight, GraduationCap } from "lucide-react";

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="市場実験室 ホーム">
          <span className="brand-mark">
            <ArrowLeftRight size={21} />
          </span>
          <span>
            <b>市場実験室</b>
            <small>ダブルオークション</small>
          </span>
        </Link>
        <div className="header-right">
          {children ?? (
            <Link className="quiet-link" href="/teacher">
              <GraduationCap size={18} />
              教員用ページ
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <span>
        市場実験室<span className="footer-separator">/</span>
        取引を通して、経済を学ぶ。
      </span>
      <Link href="/guide">実験のルール</Link>
    </footer>
  );
}
export function Spinner() {
  return <span className="spinner" aria-label="読み込み中" />;
}
