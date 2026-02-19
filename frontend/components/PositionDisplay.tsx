"use client";

import type { PositionData, MarketData } from "@/lib/types";

interface PositionDisplayProps {
  position: PositionData | null;
  market: MarketData;
}

export default function PositionDisplay({ position, market }: PositionDisplayProps) {
  if (!position) {
    return null;
  }

  const isWinner =
    market.status === "Resolved" && market.outcome === position.side;

  const handleClaim = () => {
    // TODO: call claim instruction
    alert("Claim not yet connected to chain");
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4">
      <h3 className="text-sm font-bold mb-3">Your Position</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Side</span>
          <span
            className={`font-bold ${
              position.side === "Yes" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {position.side}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Amount</span>
          <span className="font-bold">{position.amount.toLocaleString()} SBYL</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Status</span>
          <span className={position.claimed ? "text-gray-500" : isWinner ? "text-emerald-400" : "text-gray-400"}>
            {position.claimed ? "Claimed" : isWinner ? "Winner!" : market.status === "Resolved" ? "Lost" : "Pending"}
          </span>
        </div>
      </div>

      {isWinner && !position.claimed && (
        <button
          onClick={handleClaim}
          className="w-full mt-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-bold transition-colors"
        >
          Claim Winnings
        </button>
      )}
    </div>
  );
}
