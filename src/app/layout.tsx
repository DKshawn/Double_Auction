import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "市場実験室 | 3つの市場制度",
  description:
    "同じ商品をCDA・Call Market・Posted Offerで取引し、市場価格が生まれる仕組みを体験する授業用実験アプリです。",
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
