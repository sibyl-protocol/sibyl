import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("CzTVSkqAttKbsG17JqgzhsSyXiVVTf7Q5eNCd6X9bB3W");
export const RPC_URL = "https://api.devnet.solana.com";

export const SEEDS = {
  PROTOCOL: Buffer.from("protocol"),
  MARKET: Buffer.from("market"),
  POSITION: Buffer.from("position"),
  MARKET_VAULT: Buffer.from("market_vault"),
} as const;
