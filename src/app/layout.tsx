import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "個人智慧樂譜圖書館",
  description: "iPad 最佳化的 PWA 樂譜管理工具",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
