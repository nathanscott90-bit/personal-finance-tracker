import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { LOCALE } from "@/lib/locale";

// Bundled rather than fetched from Google at build time, so the app builds
// and renders offline.
const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Finance",
  description: "Personal finance tracker",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={LOCALE} className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
