import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Operator Zero",
  description: "Autonomous agent system for Shopify store operations",
};

// 260831-ipj F5: viewport-fit=cover is required for env(safe-area-inset-*) to
// resolve to anything other than 0 — without it the safe-area padding already
// applied in bottom-tabs.tsx is inert on notched devices. width/initialScale
// reproduce Next's injected default; only viewportFit is new. No desktop effect.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
        style={{
          fontFamily: "var(--font-geist-sans), var(--font-sans)",
        }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
