"use client";

import MarketCard from "@/components/MarketCard";
import { MOCK_MARKETS } from "@/lib/program";

export default function Home() {
  const markets = MOCK_MARKETS;
  const totalPool = markets.reduce((s, m) => s + m.yesPool + m.noPool, 0);
  const activeCount = markets.filter((m) => m.status === "Open").length;

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">
            Prediction Markets{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
              Resolved by AI
            </span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Multiple AI agents deliberate and resolve ambiguous events through consensus.
            No human voting delays — results confirmed in minutes.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">{activeCount}</div>
            <div className="text-xs text-gray-500">Active Markets</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">
              {totalPool.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">Total SBYL Pool</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{markets.length}</div>
            <div className="text-xs text-gray-500">Total Markets</div>
          </div>
        </div>

        {/* Market List */}
        <div className="space-y-4">
          {markets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-12 border-t border-gray-800">
        <h3 className="text-2xl font-bold text-center mb-8">How It Works</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { icon: "📋", title: "Create Market", desc: "Define an event open to interpretation" },
            { icon: "💰", title: "Place Bets", desc: "Bet SBYL tokens on Yes or No" },
            { icon: "🤖", title: "AI Resolution", desc: "AI oracle judges and resolves the market" },
            { icon: "✅", title: "Claim Winnings", desc: "Winners paid out automatically on-chain" },
          ].map((item) => (
            <div key={item.title} className="text-center">
              <div className="w-12 h-12 bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3 text-2xl">
                {item.icon}
              </div>
              <div className="text-sm font-bold mb-1">{item.title}</div>
              <div className="text-xs text-gray-500">{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-gray-600">
          <span>Sibyl Protocol — AI Oracle × Prediction Market</span>
          <span>Powered by Solana</span>
        </div>
      </footer>
    </div>
  );
}
