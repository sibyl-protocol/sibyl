"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export default function Header() {
  return (
    <header className="border-b border-gray-800 sticky top-0 z-50 bg-gray-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-lg">🔮</span>
          </div>
          <h1 className="text-xl font-bold">
            Sibyl
            <span className="text-sm font-normal text-gray-500 ml-2 hidden sm:inline">
              AI Oracle Prediction Market
            </span>
          </h1>
        </Link>

        <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-500 !rounded-lg !text-sm !font-bold !h-10" />
      </div>
    </header>
  );
}
