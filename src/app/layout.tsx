import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "MediVision AI — Know what you take. Think before you take it.",
  description:
    "Scan a medicine strip with your phone camera. Get plain-language safety information in English, Tamil and Hindi, double-dose warnings, and a 7-day caregiver summary. All data stays on your device.",
  applicationName: "MediVision AI",
  manifest: "/manifest.webmanifest",
  keywords: ["medicine scanner", "OCR", "elderly", "medication safety", "PWA"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1D4ED8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Public+Sans:wght@400;600;700&family=JetBrains+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="antialiased bg-slate-50 text-slate-900 min-h-screen flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
