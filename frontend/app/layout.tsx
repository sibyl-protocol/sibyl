import type { Metadata } from "next";
import "./globals.css";
import WalletProvider from "@/components/WalletProvider";
import Header from "@/components/Header";

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
        <WalletProvider>
          <Header />
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
