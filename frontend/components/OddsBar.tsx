"use client";

interface OddsBarProps {
  yesPool: number;
  noPool: number;
  showLabels?: boolean;
}

export default function OddsBar({ yesPool, noPool, showLabels = true }: OddsBarProps) {
  const total = yesPool + noPool;
  const yesPercent = total > 0 ? Math.round((yesPool / total) * 100) : 50;
  const noPercent = 100 - yesPercent;

  return (
    <div>
      {showLabels && (
        <div className="flex justify-between text-sm font-bold mb-1">
          <span className="text-emerald-400">Yes {yesPercent}%</span>
          <span className="text-red-400">No {noPercent}%</span>
        </div>
      )}
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
      {showLabels && (
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{yesPool.toLocaleString()} SBYL</span>
          <span>{noPool.toLocaleString()} SBYL</span>
        </div>
      )}
    </div>
  );
}
