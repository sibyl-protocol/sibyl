import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sibyl — AI Oracle Prediction Market",
  description: "AI-powered prediction market for events that require interpretation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
