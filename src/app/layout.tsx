import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "市場実験室 | ダブルオークション",
  description:
    "りんご・バナナ・みかんの取引を通して、市場価格が生まれる仕組みを体験する授業用実験アプリです。",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
