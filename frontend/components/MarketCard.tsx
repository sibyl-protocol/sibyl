"use client";

import Link from "next/link";
import OddsBar from "./OddsBar";
import type { MarketData } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  Open: "bg-emerald-500/20 text-emerald-400",
  Locked: "bg-yellow-500/20 text-yellow-400",
  Resolved: "bg-purple-500/20 text-purple-400",
  Settled: "bg-gray-500/20 text-gray-400",
};

export default function MarketCard({ market }: { market: MarketData }) {
  const deadline = new Date(market.resolutionDeadline * 1000);
  const now = Date.now();
  const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - now) / (1000 * 60 * 60 * 24)));
  const totalPool = market.yesPool + market.noPool;

  return (
    <Link href={`/markets/${market.id}`}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-colors cursor-pointer">
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_STYLES[market.status]}`}>
            {market.status}
          </span>
          <span className="ml-auto text-sm text-gray-500">
            {market.status === "Open" ? `${daysLeft}d left` : deadline.toLocaleDateString()}
          </span>
        </div>

        <h2 className="text-lg font-bold mb-2 leading-tight">{market.title}</h2>
        <p className="text-sm text-gray-400 mb-4 line-clamp-2">{market.description}</p>

        <OddsBar yesPool={market.yesPool} noPool={market.noPool} />

        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>Pool: {totalPool.toLocaleString()} SBYL</span>
          {market.outcome && (
            <span className="font-medium text-purple-400">
              Outcome: {market.outcome} ({market.oracleConfidence}% confidence)
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
