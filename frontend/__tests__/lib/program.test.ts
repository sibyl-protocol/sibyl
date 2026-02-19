import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "@/lib/constants";

// Mock findProgramAddressSync since jsdom lacks full crypto support
const mockPDA1 = PublicKey.default; // 11111...
const mockPDA2 = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

let callCount = 0;
const originalFind = PublicKey.findProgramAddressSync;

beforeAll(() => {
  PublicKey.findProgramAddressSync = jest.fn((_seeds, _programId) => {
    callCount++;
    // Return different PDAs based on call count to test differentiation
    return [callCount % 2 === 0 ? mockPDA2 : mockPDA1, 255] as [PublicKey, number];
  });
});

afterAll(() => {
  PublicKey.findProgramAddressSync = originalFind;
});

// Import after mock is set up
import { getProtocolPDA, getMarketPDA, getPositionPDA, getMarketVaultPDA } from "@/lib/program";

describe("program PDAs", () => {
  beforeEach(() => {
    callCount = 0;
    (PublicKey.findProgramAddressSync as jest.Mock).mockClear();
  });

  it("getProtocolPDA returns a valid PublicKey", () => {
    const [pda, bump] = getProtocolPDA();
    expect(pda).toBeInstanceOf(PublicKey);
    expect(bump).toBe(255);
    // Verify it was called with protocol seed and PROGRAM_ID
    expect(PublicKey.findProgramAddressSync).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Buffer)]),
      PROGRAM_ID,
    );
  });

  it("getMarketPDA is called with market seed and id buffer", () => {
    const [pda] = getMarketPDA(0);
    expect(pda).toBeInstanceOf(PublicKey);
    const calls = (PublicKey.findProgramAddressSync as jest.Mock).mock.calls;
    expect(calls[0][0].length).toBe(2); // MARKET seed + id buffer
  });

  it("getMarketPDA passes different buffers for different IDs", () => {
    getMarketPDA(0);
    getMarketPDA(1);
    const calls = (PublicKey.findProgramAddressSync as jest.Mock).mock.calls;
    const buf0 = calls[0][0][1];
    const buf1 = calls[1][0][1];
    expect(Buffer.compare(buf0, buf1)).not.toBe(0);
  });

  it("getPositionPDA includes side in derivation seeds", () => {
    const market = PublicKey.default;
    const owner = PublicKey.default;
    getPositionPDA(market, owner, 0);
    getPositionPDA(market, owner, 1);
    const calls = (PublicKey.findProgramAddressSync as jest.Mock).mock.calls;
    // Side byte differs
    const side0 = calls[0][0][3];
    const side1 = calls[1][0][3];
    expect(Buffer.compare(side0, side1)).not.toBe(0);
  });

  it("getMarketVaultPDA returns a valid PublicKey", () => {
    const [pda] = getMarketVaultPDA(5);
    expect(pda).toBeInstanceOf(PublicKey);
  });
});
