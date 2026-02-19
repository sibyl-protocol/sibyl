"use client";

import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { PROGRAM_ID, RPC_URL, SEEDS } from "./constants";
import type { MarketData, PositionData, MarketStatus, Outcome } from "./types";
import IDL from "./sibyl_idl.json";

export function getConnection() {
  return new Connection(RPC_URL, "confirmed");
}

export function getProvider(wallet: any) {
  const connection = getConnection();
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

export function getProgram(wallet: any) {
  const provider = getProvider(wallet);
  return new Program(IDL as any, provider);
}

export function getProtocolPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEEDS.PROTOCOL], PROGRAM_ID);
}

export function getMarketPDA(marketId: number | BN): [PublicKey, number] {
  const id = marketId instanceof BN ? marketId : new BN(marketId);
  return PublicKey.findProgramAddressSync(
    [SEEDS.MARKET, id.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

export function getMarketVaultPDA(marketId: number | BN): [PublicKey, number] {
  const id = marketId instanceof BN ? marketId : new BN(marketId);
  return PublicKey.findProgramAddressSync(
    [SEEDS.MARKET_VAULT, id.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

export function getPositionPDA(
  marketPubkey: PublicKey,
  ownerPubkey: PublicKey,
  side: number, // 0 = Yes, 1 = No
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.POSITION, marketPubkey.toBuffer(), ownerPubkey.toBuffer(), Buffer.from([side])],
    PROGRAM_ID
  );
}

// Parse on-chain market status enum
function parseStatus(status: any): MarketStatus {
  if (status.open) return "Open";
  if (status.locked) return "Locked";
  if (status.resolved) return "Resolved";
  if (status.settled) return "Settled";
  return "Open";
}

function parseOutcome(outcome: any): Outcome | null {
  if (!outcome) return null;
  if (outcome.yes) return "Yes";
  if (outcome.no) return "No";
  if (outcome.invalid) return "Invalid";
  return null;
}

// Mock markets for development
export const MOCK_MARKETS: MarketData[] = [
  {
    id: 0,
    authority: "11111111111111111111111111111111",
    title: "Will the CLARITY Act (H.R.3633) be signed into law by August 31, 2026?",
    description:
      "The Digital Asset Market Clarity Act defines the regulatory framework for crypto assets, clarifying SEC and CFTC jurisdiction.",
    resolutionDeadline: Math.floor(new Date("2026-08-31").getTime() / 1000),
    yesPool: 142500,
    noPool: 87300,
    status: "Open",
    outcome: null,
    oracleConfidence: 0,
    publicKey: "mock1",
  },
  {
    id: 1,
    authority: "11111111111111111111111111111111",
    title: "Will Ethereum ETF net inflows exceed $10B by end of Q2 2026?",
    description:
      "Tracking cumulative net inflows into all approved spot Ethereum ETFs in the United States.",
    resolutionDeadline: Math.floor(new Date("2026-06-30").getTime() / 1000),
    yesPool: 203000,
    noPool: 156000,
    status: "Open",
    outcome: null,
    oracleConfidence: 0,
    publicKey: "mock2",
  },
  {
    id: 2,
    authority: "11111111111111111111111111111111",
    title: "Will Bitcoin reach $200k before July 2026?",
    description: "Bitcoin spot price on major exchanges reaching $200,000 USD.",
    resolutionDeadline: Math.floor(new Date("2026-07-01").getTime() / 1000),
    yesPool: 89000,
    noPool: 312000,
    status: "Locked",
    outcome: null,
    oracleConfidence: 0,
    publicKey: "mock3",
  },
  {
    id: 3,
    authority: "11111111111111111111111111111111",
    title: "Did GPT-5 pass the Turing Test in 2025?",
    description: "Whether GPT-5 passed a standardized Turing Test administered by independent researchers.",
    resolutionDeadline: Math.floor(new Date("2025-12-31").getTime() / 1000),
    yesPool: 45000,
    noPool: 178000,
    status: "Resolved",
    outcome: "No",
    oracleConfidence: 87,
    publicKey: "mock4",
  },
];
