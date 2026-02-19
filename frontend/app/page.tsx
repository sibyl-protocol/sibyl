"use client";

import { useState } from "react";

// Mock data
const MARKETS = [
  {
    id: "clarity-act",
    title: "CLARITY Act (H.R.3633) が2026年8月31日までに大統領署名で成立するか？",
    description:
      "Digital Asset Market Clarity Act — 暗号資産の規制枠組みを定義する米国法案。SECとCFTCの管轄を明確化する。",
    deadline: "2026-08-31",
    yesPool: 142500,
    noPool: 87300,
    totalBets: 347,
    status: "active" as const,
    tags: ["規制", "米国", "DeFi"],
    oracleAgents: [
      { name: "Gemini 3 Pro", status: "待機中" },
      { name: "Claude Opus 4.5", status: "待機中" },
      { name: "GPT-5.2", status: "待機中" },
    ],
  },
];

function MarketCard({ market }: { market: (typeof MARKETS)[0] }) {
  const [betSide, setBetSide] = useState<"yes" | "no" | null>(null);
  const [betAmount, setBetAmount] = useState("");

  const totalPool = market.yesPool + market.noPool;
  const yesPercent = Math.round((market.yesPool / totalPool) * 100);
  const noPercent = 100 - yesPercent;

  const daysLeft = Math.ceil(
    (new Date(market.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-2 mb-3">
          {market.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-300 rounded-full"
            >
              {tag}
            </span>
          ))}
          <span className="ml-auto text-sm text-gray-500">
            残り {daysLeft} 日
          </span>
        </div>

        <h2 className="text-xl font-bold mb-2 leading-tight">{market.title}</h2>
        <p className="text-sm text-gray-400">{market.description}</p>
      </div>

      {/* Probability Bar */}
      <div className="px-6 pb-4">
        <div className="flex justify-between text-sm font-bold mb-1">
          <span className="text-emerald-400">Yes {yesPercent}%</span>
          <span className="text-red-400">No {noPercent}%</span>
        </div>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden flex">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${yesPercent}%` }}
          />
          <div
            className="bg-red-500 transition-all duration-500"
            style={{ width: `${noPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{market.yesPool.toLocaleString()} SBYL</span>
          <span>{market.noPool.toLocaleString()} SBYL</span>
        </div>
      </div>

      {/* Betting Section */}
      <div className="px-6 pb-4">
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setBetSide("yes")}
            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${
              betSide === "yes"
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            }`}
          >
            Yes にベット
          </button>
          <button
            onClick={() => setBetSide("no")}
            className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${
              betSide === "no"
                ? "bg-red-500 text-white shadow-lg shadow-red-500/25"
                : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
            }`}
          >
            No にベット
          </button>
        </div>

        {betSide && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                placeholder="金額"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                SBYL
              </span>
            </div>
            <button className="px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-bold transition-colors">
              確定
            </button>
          </div>
        )}
      </div>

      {/* Oracle Agents */}
      <div className="border-t border-gray-800 px-6 py-4">
        <div className="flex items-center gap-2 mb-2">
          <svg
            className="w-4 h-4 text-purple-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <span className="text-xs font-medium text-gray-400">
            Oracle Agents（判定時に起動）
          </span>
        </div>
        <div className="flex gap-2">
          {market.oracleAgents.map((agent) => (
            <span
              key={agent.name}
              className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded-md"
            >
              {agent.name}
            </span>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="border-t border-gray-800 px-6 py-3 flex items-center justify-between text-xs text-gray-500">
        <span>{market.totalBets} ベット</span>
        <span>
          プール合計: {totalPool.toLocaleString()} SBYL
        </span>
        <span>期限: {market.deadline}</span>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-lg">🔮</span>
            </div>
            <h1 className="text-xl font-bold">
              Sibyl
              <span className="text-sm font-normal text-gray-500 ml-2">
                AI Oracle Prediction Market
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-400">
              <span className="text-purple-400 font-bold">SBYL</span> 0.00
            </div>
            <button className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-bold transition-colors">
              ウォレット接続
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">
            AIが
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
              判定
            </span>
            する予測市場
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            複数のAIエージェントが合議して、解釈が分かれるイベントを判定。
            人間の投票を待たずに、数分で結果を確定。
          </p>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">1</div>
            <div className="text-xs text-gray-500">アクティブマーケット</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">
              229,800
            </div>
            <div className="text-xs text-gray-500">SBYL プール合計</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">3</div>
            <div className="text-xs text-gray-500">Oracle Agents</div>
          </div>
        </div>

        {/* Markets */}
        <div className="space-y-6">
          {MARKETS.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-12 border-t border-gray-800">
        <h3 className="text-2xl font-bold text-center mb-8">仕組み</h3>
        <div className="grid grid-cols-4 gap-6">
          {[
            {
              step: "1",
              title: "マーケット作成",
              desc: "解釈が分かれるイベントを設定",
              icon: "📋",
            },
            {
              step: "2",
              title: "ベット",
              desc: "SOL/USDCで参加、内部でSBYLに変換",
              icon: "💰",
            },
            {
              step: "3",
              title: "AI判定",
              desc: "3つのAIが独立に判断し合議",
              icon: "🤖",
            },
            {
              step: "4",
              title: "自動精算",
              desc: "判定確定後、勝者に自動配分",
              icon: "✅",
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
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
