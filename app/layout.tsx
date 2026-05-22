import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Operator Zero",
  description: "Autonomous agent system for Shopify store operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
