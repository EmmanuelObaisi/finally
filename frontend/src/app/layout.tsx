import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "FinAlly" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface text-slate-200 antialiased">{children}</body>
    </html>
  );
}
