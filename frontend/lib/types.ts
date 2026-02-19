export type MarketStatus = "Open" | "Locked" | "Resolved" | "Settled";
export type Outcome = "Yes" | "No" | "Invalid";

export interface MarketData {
  id: number;
  authority: string;
  title: string;
  description: string;
  resolutionDeadline: number; // unix timestamp
  yesPool: number;
  noPool: number;
  status: MarketStatus;
  outcome: Outcome | null;
  oracleConfidence: number;
  publicKey: string;
}

export interface PositionData {
  owner: string;
  market: string;
  side: Outcome;
  amount: number;
  claimed: boolean;
  publicKey: string;
}
