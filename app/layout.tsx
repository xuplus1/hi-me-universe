import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hi！Me · 私人书影音档案",
  description: "一间会随着书、电影与时间慢慢生长的私人档案。",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="theme-color" content="#f4efe4" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&family=Shippori+Mincho+B1:wght@500;600&display=swap" rel="stylesheet" />
        <link href="/styles.css" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
