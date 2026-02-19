import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, SEEDS } from "@/lib/constants";

describe("constants", () => {
  it("PROGRAM_ID is a valid PublicKey", () => {
    expect(PROGRAM_ID).toBeInstanceOf(PublicKey);
    expect(PROGRAM_ID.toBase58()).toBeTruthy();
  });

  it("all SEEDS are defined as Buffers", () => {
    expect(SEEDS.PROTOCOL).toBeInstanceOf(Buffer);
    expect(SEEDS.MARKET).toBeInstanceOf(Buffer);
    expect(SEEDS.POSITION).toBeInstanceOf(Buffer);
    expect(SEEDS.MARKET_VAULT).toBeInstanceOf(Buffer);
  });
});
