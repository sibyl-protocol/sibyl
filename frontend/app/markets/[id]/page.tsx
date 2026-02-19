"use client";

import { use } from "react";
import Link from "next/link";
import OddsBar from "@/components/OddsBar";
import BetForm from "@/components/BetForm";
import PositionDisplay from "@/components/PositionDisplay";
import { MOCK_MARKETS } from "@/lib/program";
import type { MarketData } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  Open: "bg-emerald-500/20 text-emerald-400",
  Locked: "bg-yellow-500/20 text-yellow-400",
  Resolved: "bg-purple-500/20 text-purple-400",
  Settled: "bg-gray-500/20 text-gray-400",
};

export default function MarketDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const market: MarketData | undefined = MOCK_MARKETS.find(
    (m) => m.id === Number(id)
  );

  if (!market) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-2xl font-bold mb-2">Market not found</h2>
        <Link href="/" className="text-purple-400 hover:underline text-sm">
          ← Back to markets
        </Link>
      </div>
    );
  }

  const deadline = new Date(market.resolutionDeadline * 1000);
  const totalPool = market.yesPool + market.noPool;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Back link */}
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 mb-6 inline-block">
        ← All Markets
      </Link>

      {/* Title & Status */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-3 py-1 text-xs font-medium rounded-full ${STATUS_STYLES[market.status]}`}>
            {market.status}
          </span>
          {market.outcome && (
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-purple-500/20 text-purple-300">
              Outcome: {market.outcome} · {market.oracleConfidence}% confidence
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold mb-3">{market.title}</h1>
        <p className="text-gray-400">{market.description}</p>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Total Pool</div>
          <div className="text-xl font-bold">{totalPool.toLocaleString()} <span className="text-sm text-gray-400">SBYL</span></div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Deadline</div>
          <div className="text-xl font-bold">{deadline.toLocaleDateString()}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Status</div>
          <div className="text-xl font-bold">{market.status}</div>
        </div>
      </div>

      {/* Odds */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h3 className="text-sm font-bold mb-3">Current Odds</h3>
        <OddsBar yesPool={market.yesPool} noPool={market.noPool} />
      </div>

      {/* Bet + Position side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BetForm market={market} />
        <PositionDisplay position={null} market={market} />
      </div>
    </div>
  );
}
