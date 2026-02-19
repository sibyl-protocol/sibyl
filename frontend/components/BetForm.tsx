"use client";

import { useState } from "react";
import type { MarketData } from "@/lib/types";

interface BetFormProps {
  market: MarketData;
}

export default function BetForm({ market }: BetFormProps) {
  const [side, setSide] = useState<"Yes" | "No" | null>(null);
  const [amount, setAmount] = useState("");

  const isOpen = market.status === "Open";

  const handleSubmit = () => {
    if (!side || !amount || Number(amount) <= 0) return;
    // TODO: call place_bet instruction
    alert(`Placing ${amount} SBYL bet on ${side} (not yet connected to chain)`);
  };

  if (!isOpen) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-4 text-center text-gray-500 text-sm">
        Betting is closed for this market
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 rounded-xl p-4">
      <h3 className="text-sm font-bold mb-3">Place a Bet</h3>
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setSide("Yes")}
          className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${
            side === "Yes"
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
              : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
          }`}
        >
          Yes
        </button>
        <button
          onClick={() => setSide("No")}
          className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${
            side === "No"
              ? "bg-red-500 text-white shadow-lg shadow-red-500/25"
              : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
          }`}
        >
          No
        </button>
      </div>

      {side && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
              SBYL
            </span>
          </div>
          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-bold transition-colors"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}
