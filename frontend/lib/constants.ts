import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("wQpV3yz4oTyRf4SE3xoZkBjxDTNSHUUUDgqT7YsKfcF");
export const RPC_URL = "https://api.devnet.solana.com";

export const SEEDS = {
  PROTOCOL: Buffer.from("protocol"),
  MARKET: Buffer.from("market"),
  POSITION: Buffer.from("position"),
  MARKET_VAULT: Buffer.from("market_vault"),
} as const;
