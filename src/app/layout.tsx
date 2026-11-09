import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata = {
  title: "MediVision AI — A little clarity. Better care.",
  description: "Know what you take. Think before you take it. Private, on-device medicine scanning, plain-language references and everyday care tools.",
  manifest: "/manifest.webmanifest",
  applicationName: "MediVision AI",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "MediVision" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#4164db", colorScheme: "light" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}<noscript><div style={{padding:30,fontSize:20}}>MediVision needs JavaScript for private, on-device scanning and storage. Please enable it in your browser. For medicine questions, ask your pharmacist.</div></noscript></body></html>;
}
