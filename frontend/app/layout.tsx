import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import PushManager from "@/components/PushManager";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Prozorro Monitor",
  description: "MVP поиск тендеров",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tenders",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className={`${inter.className} bg-gray-50 text-gray-900 select-none`}>
        <PushManager />
        <main className="min-h-screen pb-[calc(4rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
          {children}
        </main>
        <Navbar />
      </body>
    </html>
  );
}