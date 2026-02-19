import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Sibyl } from "../target/types/sibyl";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import BN from "bn.js";

const PROTOCOL_SEED = Buffer.from("protocol");
const MARKET_SEED = Buffer.from("market");
const POSITION_SEED = Buffer.from("position");
const MARKET_VAULT_SEED = Buffer.from("market_vault");

function sideToU8(side: any): number {
  if (side.yes !== undefined) return 0;
  if (side.no !== undefined) return 1;
  if (side.invalid !== undefined) return 2;
  throw new Error("Unknown side");
}

describe("sibyl", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.sibyl as Program<Sibyl>;
  const connection = provider.connection;

  const authority = provider.wallet as anchor.Wallet;
  const oracle = Keypair.generate();
  const treasury = Keypair.generate();
  const userA = Keypair.generate();
  const userB = Keypair.generate();
  const sbylMint = Keypair.generate();

  const FEE_BPS = 500;
  const SWAP_CAP = new BN(10_000_000_000);

  let protocolPda: PublicKey;
  let protocolBump: number;
  let treasuryAta: PublicKey; // SBYL token account for treasury

  function getProtocolPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([PROTOCOL_SEED], program.programId);
  }

  function getMarketPda(marketId: number): [PublicKey, number] {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(marketId));
    return PublicKey.findProgramAddressSync([MARKET_SEED, buf], program.programId);
  }

  function getMarketVaultPda(marketId: number): [PublicKey, number] {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(marketId));
    return PublicKey.findProgramAddressSync([MARKET_VAULT_SEED, buf], program.programId);
  }

  function getPositionPda(marketKey: PublicKey, userKey: PublicKey, side: any): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [POSITION_SEED, marketKey.toBuffer(), userKey.toBuffer(), Buffer.from([sideToU8(side)])],
      program.programId
    );
  }

  async function airdrop(to: PublicKey, amount: number) {
    const sig = await connection.requestAirdrop(to, amount);
    await connection.confirmTransaction(sig, "confirmed");
  }

  async function getOrCreateAta(payer: Keypair | anchor.Wallet, mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(mint, owner, true);
    const info = await connection.getAccountInfo(ata);
    if (!info) {
      const ix = createAssociatedTokenAccountInstruction(
        payer instanceof Keypair ? payer.publicKey : payer.publicKey,
        ata, owner, mint
      );
      const tx = new anchor.web3.Transaction().add(ix);
      if (payer instanceof Keypair) {
        await provider.sendAndConfirm(tx, [payer]);
      } else {
        await provider.sendAndConfirm(tx);
      }
    }
    return ata;
  }

  async function initializeProtocol() {
    [protocolPda, protocolBump] = getProtocolPda();
    await program.methods
      .initialize(FEE_BPS, SWAP_CAP)
      .accounts({
        protocol: protocolPda,
        sbylMint: sbylMint.publicKey,
        treasury: treasury.publicKey,
        oracle: oracle.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([sbylMint])
      .rpc();
    // Create treasury ATA for fee collection
    treasuryAta = await getOrCreateAta(authority, sbylMint.publicKey, treasury.publicKey);
  }

  async function createMarket(marketId: number, title = "Will BTC hit 100k?", desc = "Bitcoin price prediction", deadline?: number) {
    const [marketPda] = getMarketPda(marketId);
    const [vaultPda] = getMarketVaultPda(marketId);
    const dl = deadline ?? Math.floor(Date.now() / 1000) + 3600;
    await program.methods
      .createMarket(title, desc, new BN(dl))
      .accounts({
        protocol: protocolPda, market: marketPda, marketVault: vaultPda,
        sbylMint: sbylMint.publicKey, authority: authority.publicKey,
        systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    return { marketPda, vaultPda };
  }

  async function swapToSbyl(user: Keypair, amount: number) {
    const userAta = await getOrCreateAta(user, sbylMint.publicKey, user.publicKey);
    await program.methods
      .swapToSbyl(new BN(amount))
      .accounts({
        protocol: protocolPda, sbylMint: sbylMint.publicKey,
        userTokenAccount: userAta, treasury: treasury.publicKey,
        user: user.publicKey, systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();
    return userAta;
  }

  async function placeBet(user: Keypair, marketPda: PublicKey, marketId: number, side: any, amount: number) {
    const userAta = getAssociatedTokenAddressSync(sbylMint.publicKey, user.publicKey);
    const [vaultPda] = getMarketVaultPda(marketId);
    const [positionPda] = getPositionPda(marketPda, user.publicKey, side);
    await program.methods
      .placeBet(side, new BN(amount))
      .accounts({
        market: marketPda, position: positionPda, marketVault: vaultPda,
        userTokenAccount: userAta, user: user.publicKey,
        systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();
    return positionPda;
  }

  async function resolveMarket(marketPda: PublicKey, outcome: any, confidence: number) {
    await program.methods
      .resolve(outcome, confidence)
      .accounts({ protocol: protocolPda, market: marketPda, oracle: oracle.publicKey })
      .signers([oracle])
      .rpc();
  }

  async function claimPayout(user: Keypair, marketPda: PublicKey, marketId: number, side: any) {
    const userAta = getAssociatedTokenAddressSync(sbylMint.publicKey, user.publicKey);
    const [vaultPda] = getMarketVaultPda(marketId);
    const [positionPda] = getPositionPda(marketPda, user.publicKey, side);
    await program.methods
      .claim()
      .accounts({
        protocol: protocolPda, market: marketPda, position: positionPda,
        marketVault: vaultPda, userTokenAccount: userAta,
        treasury: treasuryAta, user: user.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();
  }

  async function getNextMarketId(): Promise<number> {
    const protocol = await program.account.protocol.fetch(protocolPda);
    return protocol.marketCount.toNumber();
  }

  // =========================================================================
  before(async () => {
    await Promise.all([
      airdrop(oracle.publicKey, 10 * LAMPORTS_PER_SOL),
      airdrop(userA.publicKey, 10 * LAMPORTS_PER_SOL),
      airdrop(userB.publicKey, 10 * LAMPORTS_PER_SOL),
      airdrop(treasury.publicKey, 1 * LAMPORTS_PER_SOL),
    ]);
  });

  // =========================================================================
  // Happy Path
  // =========================================================================
  describe("Happy Path", () => {
    it("initialize — creates protocol with SBYL mint and swap_cap", async () => {
      await initializeProtocol();
      const protocol = await program.account.protocol.fetch(protocolPda);
      expect(protocol.authority.toBase58()).to.equal(authority.publicKey.toBase58());
      expect(protocol.oracle.toBase58()).to.equal(oracle.publicKey.toBase58());
      expect(protocol.sbylMint.toBase58()).to.equal(sbylMint.publicKey.toBase58());
      expect(protocol.feeBps).to.equal(FEE_BPS);
      expect(protocol.swapCap.toNumber()).to.equal(10_000_000_000);
      expect(protocol.marketCount.toNumber()).to.equal(0);
    });

    it("create_market — creates a prediction market", async () => {
      // Short deadline for resolve test
      const deadline = Math.floor(Date.now() / 1000) + 4;
      const { marketPda } = await createMarket(0, "Will BTC hit 100k?", "Bitcoin price prediction", deadline);
      const market = await program.account.market.fetch(marketPda);
      expect(market.id.toNumber()).to.equal(0);
      expect(market.title).to.equal("Will BTC hit 100k?");
      expect(JSON.stringify(market.status)).to.equal(JSON.stringify({ open: {} }));
    });

    it("swap_to_sbyl — SOL to SBYL conversion", async () => {
      const swapAmount = 1_000_000_000;
      const userAta = await swapToSbyl(userA, swapAmount);
      const account = await getAccount(connection, userAta);
      expect(Number(account.amount)).to.equal(swapAmount);
    });

    it("place_bet — bet Yes (userA) and bet No (userB)", async () => {
      await swapToSbyl(userB, 1_000_000_000);
      const [marketPda] = getMarketPda(0);
      const betAmount = 500_000_000;

      await placeBet(userA, marketPda, 0, { yes: {} }, betAmount);
      const posA = await program.account.position.fetch(getPositionPda(marketPda, userA.publicKey, { yes: {} })[0]);
      expect(posA.amount.toNumber()).to.equal(betAmount);

      await placeBet(userB, marketPda, 0, { no: {} }, betAmount);
      const posB = await program.account.position.fetch(getPositionPda(marketPda, userB.publicKey, { no: {} })[0]);
      expect(posB.amount.toNumber()).to.equal(betAmount);

      const market = await program.account.market.fetch(marketPda);
      expect(market.yesPool.toNumber()).to.equal(betAmount);
      expect(market.noPool.toNumber()).to.equal(betAmount);
    });

    it("place_bet — additional bet on same side", async () => {
      const [marketPda] = getMarketPda(0);
      await placeBet(userA, marketPda, 0, { yes: {} }, 200_000_000);
      const pos = await program.account.position.fetch(getPositionPda(marketPda, userA.publicKey, { yes: {} })[0]);
      expect(pos.amount.toNumber()).to.equal(700_000_000);
    });

    it("resolve — oracle resolves market as Yes (after deadline)", async () => {
      const [marketPda] = getMarketPda(0);
      // Wait for 4s deadline
      await new Promise((r) => setTimeout(r, 5000));
      await resolveMarket(marketPda, { yes: {} }, 95);
      const market = await program.account.market.fetch(marketPda);
      expect(JSON.stringify(market.status)).to.equal(JSON.stringify({ resolved: {} }));
      expect(JSON.stringify(market.outcome)).to.equal(JSON.stringify({ yes: {} }));
    });

    it("claim — winner claims payout with correct fee deduction", async () => {
      const [marketPda] = getMarketPda(0);
      const userAta = getAssociatedTokenAddressSync(sbylMint.publicKey, userA.publicKey);
      const balanceBefore = Number((await getAccount(connection, userAta)).amount);
      await claimPayout(userA, marketPda, 0, { yes: {} });
      const balanceAfter = Number((await getAccount(connection, userAta)).amount);
      // 700 * 1200 / 700 = 1200, fee = 60, net = 1140
      expect(balanceAfter - balanceBefore).to.equal(1_140_000_000);
    });
  });

  // =========================================================================
  // Issue #6: Both-side betting
  // =========================================================================
  describe("Both-side betting (Issue #6)", () => {
    it("user can bet on both Yes and No in the same market", async () => {
      const nextId = await getNextMarketId();
      const { marketPda } = await createMarket(nextId, "Both sides test");

      const bothUser = Keypair.generate();
      await airdrop(bothUser.publicKey, 5 * LAMPORTS_PER_SOL);
      await swapToSbyl(bothUser, 2_000_000_000);

      await placeBet(bothUser, marketPda, nextId, { yes: {} }, 300_000_000);
      await placeBet(bothUser, marketPda, nextId, { no: {} }, 200_000_000);

      const posYes = await program.account.position.fetch(getPositionPda(marketPda, bothUser.publicKey, { yes: {} })[0]);
      const posNo = await program.account.position.fetch(getPositionPda(marketPda, bothUser.publicKey, { no: {} })[0]);
      expect(posYes.amount.toNumber()).to.equal(300_000_000);
      expect(posNo.amount.toNumber()).to.equal(200_000_000);
    });
  });

  // =========================================================================
  // Issue #1: Resolve before deadline
  // =========================================================================
  describe("Resolve before deadline (Issue #1)", () => {
    it("resolve before deadline → DeadlineNotReached", async () => {
      const nextId = await getNextMarketId();
      const { marketPda } = await createMarket(nextId, "Deadline test", "desc", Math.floor(Date.now() / 1000) + 3600);
      try {
        await resolveMarket(marketPda, { yes: {} }, 90);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.contain("DeadlineNotReached");
      }
    });
  });

  // =========================================================================
  // Issue #4: Treasury validation
  // =========================================================================
  describe("Treasury validation (Issue #4)", () => {
    it("claim with wrong treasury → fails with TreasuryMismatch", async () => {
      const nextId = await getNextMarketId();
      const deadline = Math.floor(Date.now() / 1000) + 3;
      const { marketPda } = await createMarket(nextId, "Treasury test", "desc", deadline);

      const tUser = Keypair.generate();
      await airdrop(tUser.publicKey, 5 * LAMPORTS_PER_SOL);
      await swapToSbyl(tUser, 1_000_000_000);
      await placeBet(tUser, marketPda, nextId, { yes: {} }, 500_000_000);

      await new Promise((r) => setTimeout(r, 4000));
      await resolveMarket(marketPda, { yes: {} }, 90);

      // Create a fake treasury ATA owned by a different keypair
      const fakeTreasuryOwner = Keypair.generate();
      await airdrop(fakeTreasuryOwner.publicKey, 1 * LAMPORTS_PER_SOL);
      const fakeAta = await getOrCreateAta(authority, sbylMint.publicKey, fakeTreasuryOwner.publicKey);

      const userAta = getAssociatedTokenAddressSync(sbylMint.publicKey, tUser.publicKey);
      const [vaultPda] = getMarketVaultPda(nextId);
      const [positionPda] = getPositionPda(marketPda, tUser.publicKey, { yes: {} });

      try {
        await program.methods
          .claim()
          .accounts({
            protocol: protocolPda, market: marketPda, position: positionPda,
            marketVault: vaultPda, userTokenAccount: userAta,
            treasury: fakeAta, user: tUser.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([tUser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.contain("TreasuryMismatch");
      }
    });
  });

  // =========================================================================
  // Issue #5: Swap cap
  // =========================================================================
  describe("Swap cap (Issue #5)", () => {
    it("swap exceeding cap → SwapCapExceeded", async () => {
      const bigUser = Keypair.generate();
      await airdrop(bigUser.publicKey, 20 * LAMPORTS_PER_SOL);
      await getOrCreateAta(bigUser, sbylMint.publicKey, bigUser.publicKey);
      try {
        await swapToSbyl(bigUser, 11_000_000_000);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.contain("SwapCapExceeded");
      }
    });
  });

  // =========================================================================
  // Full end-to-end flow
  // =========================================================================
  describe("Full end-to-end flow", () => {
    const e2eUserA = Keypair.generate();
    const e2eUserB = Keypair.generate();

    before(async () => {
      await Promise.all([
        airdrop(e2eUserA.publicKey, 10 * LAMPORTS_PER_SOL),
        airdrop(e2eUserB.publicKey, 10 * LAMPORTS_PER_SOL),
      ]);
    });

    it("init → create → swap → bet → resolve → claim", async () => {
      const nextId = await getNextMarketId();
      const deadline = Math.floor(Date.now() / 1000) + 3;
      const { marketPda } = await createMarket(nextId, "Will ETH flip BTC?", "Market cap comparison", deadline);

      await swapToSbyl(e2eUserA, 2_000_000_000);
      await swapToSbyl(e2eUserB, 2_000_000_000);

      await placeBet(e2eUserA, marketPda, nextId, { no: {} }, 1_000_000_000);
      await placeBet(e2eUserB, marketPda, nextId, { yes: {} }, 1_000_000_000);

      await new Promise((r) => setTimeout(r, 4000));
      await resolveMarket(marketPda, { no: {} }, 80);

      await claimPayout(e2eUserA, marketPda, nextId, { no: {} });
      const pos = await program.account.position.fetch(getPositionPda(marketPda, e2eUserA.publicKey, { no: {} })[0]);
      expect(pos.claimed).to.be.true;
    });
  });

  // =========================================================================
  // Error Cases
  // =========================================================================
  describe("Error Cases", () => {
    it("create_market with title too long → TitleTooLong", async () => {
      try {
        const nextId = await getNextMarketId();
        await createMarket(nextId, "A".repeat(201));
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.contain("TitleTooLong");
      }
    });

    it("create_market with deadline in past → DeadlineInPast", async () => {
      try {
        const nextId = await getNextMarketId();
        const [marketPda] = getMarketPda(nextId);
        const [vaultPda] = getMarketVaultPda(nextId);
        await program.methods
          .createMarket("Past market", "desc", new BN(Math.floor(Date.now() / 1000) - 3600))
          .accounts({
            protocol: protocolPda, market: marketPda, marketVault: vaultPda,
            sbylMint: sbylMint.publicKey, authority: authority.publicKey,
            systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.contain("DeadlineInPast");
      }
    });

    it("create_market by non-authority → should fail", async () => {
      const fakeAuth = Keypair.generate();
      await airdrop(fakeAuth.publicKey, 2 * LAMPORTS_PER_SOL);
      try {
        const nextId = await getNextMarketId();
        const [marketPda] = getMarketPda(nextId);
        const [vaultPda] = getMarketVaultPda(nextId);
        await program.methods
          .createMarket("Fake", "desc", new BN(Math.floor(Date.now() / 1000) + 3600))
          .accounts({
            protocol: protocolPda, market: marketPda, marketVault: vaultPda,
            sbylMint: sbylMint.publicKey, authority: fakeAuth.publicKey,
            systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([fakeAuth])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.exist;
      }
    });

    it("place_bet on resolved market → MarketNotOpen", async () => {
      const [marketPda] = getMarketPda(0);
      const bettor = Keypair.generate();
      await airdrop(bettor.publicKey, 5 * LAMPORTS_PER_SOL);
      await swapToSbyl(bettor, 1_000_000_000);
      try {
        await placeBet(bettor, marketPda, 0, { yes: {} }, 100_000_000);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.contain("MarketNotOpen");
      }
    });

    it("place_bet with amount 0 → ZeroAmount", async () => {
      const nextId = await getNextMarketId();
      const { marketPda } = await createMarket(nextId, "Zero amount test");
      try {
        await placeBet(userA, marketPda, nextId, { yes: {} }, 0);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.contain("ZeroAmount");
      }
    });

    it("place_bet with Invalid side → InvalidBetSide", async () => {
      const nextId = await getNextMarketId();
      const { marketPda } = await createMarket(nextId, "Invalid side test");
      try {
        await placeBet(userA, marketPda, nextId, { invalid: {} }, 100_000_000);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.contain("InvalidBetSide");
      }
    });

    it("resolve by non-oracle → should fail", async () => {
      const nextId = await getNextMarketId();
      const { marketPda } = await createMarket(nextId, "Non-oracle test");
      const fakeOracle = Keypair.generate();
      await airdrop(fakeOracle.publicKey, 1 * LAMPORTS_PER_SOL);
      try {
        await program.methods
          .resolve({ yes: {} }, 90)
          .accounts({ protocol: protocolPda, market: marketPda, oracle: fakeOracle.publicKey })
          .signers([fakeOracle])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err).to.exist;
      }
    });

    it("resolve on already resolved market → MarketNotResolvable", async () => {
      const [marketPda] = getMarketPda(0);
      try {
        await resolveMarket(marketPda, { yes: {} }, 90);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.contain("MarketNotResolvable");
      }
    });

    it("claim before resolution → MarketNotResolved", async () => {
      const nextId = await getNextMarketId();
      const { marketPda } = await createMarket(nextId, "Claim before resolve");
      await placeBet(userA, marketPda, nextId, { yes: {} }, 100_000_000);
      try {
        await claimPayout(userA, marketPda, nextId, { yes: {} });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.contain("MarketNotResolved");
      }
    });

    it("claim by loser → NotWinner", async () => {
      // Market 0: resolved Yes. userB bet No.
      const [marketPda] = getMarketPda(0);
      try {
        await claimPayout(userB, marketPda, 0, { no: {} });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.contain("NotWinner");
      }
    });

    it("claim twice → AlreadyClaimed", async () => {
      const [marketPda] = getMarketPda(0);
      try {
        await claimPayout(userA, marketPda, 0, { yes: {} });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.contain("AlreadyClaimed");
      }
    });

    it("resolve with confidence > 100 → InvalidConfidence", async () => {
      const nextId = await getNextMarketId();
      const { marketPda } = await createMarket(nextId, "Bad confidence test");
      try {
        await resolveMarket(marketPda, { yes: {} }, 101);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.error?.errorCode?.code || err.toString()).to.contain("InvalidConfidence");
      }
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe("Edge Cases", () => {
    it("Invalid outcome — both sides get refund", async () => {
      const nextId = await getNextMarketId();
      const deadline = Math.floor(Date.now() / 1000) + 6;
      const { marketPda } = await createMarket(nextId, "Invalid outcome test", "desc", deadline);

      const refundUserA = Keypair.generate();
      const refundUserB = Keypair.generate();
      await Promise.all([
        airdrop(refundUserA.publicKey, 5 * LAMPORTS_PER_SOL),
        airdrop(refundUserB.publicKey, 5 * LAMPORTS_PER_SOL),
      ]);

      const betAmount = 500_000_000;
      await swapToSbyl(refundUserA, 1_000_000_000);
      await swapToSbyl(refundUserB, 1_000_000_000);

      await placeBet(refundUserA, marketPda, nextId, { yes: {} }, betAmount);
      await placeBet(refundUserB, marketPda, nextId, { no: {} }, betAmount);

      // Wait for deadline
      await new Promise((r) => setTimeout(r, 7000));

      await resolveMarket(marketPda, { invalid: {} }, 50);

      const ataA = getAssociatedTokenAddressSync(sbylMint.publicKey, refundUserA.publicKey);
      const balBeforeA = Number((await getAccount(connection, ataA)).amount);
      await claimPayout(refundUserA, marketPda, nextId, { yes: {} });
      const balAfterA = Number((await getAccount(connection, ataA)).amount);
      // 500M * 1000M / 500M = 1000M (no fee for Invalid)
      expect(balAfterA - balBeforeA).to.equal(1_000_000_000);
    });

    it("Market with only one side having bets", async () => {
      const nextId = await getNextMarketId();
      const deadline = Math.floor(Date.now() / 1000) + 4;
      const { marketPda } = await createMarket(nextId, "One-sided market", "desc", deadline);

      const soloUser = Keypair.generate();
      await airdrop(soloUser.publicKey, 5 * LAMPORTS_PER_SOL);
      await swapToSbyl(soloUser, 1_000_000_000);

      await placeBet(soloUser, marketPda, nextId, { yes: {} }, 500_000_000);

      await new Promise((r) => setTimeout(r, 5000));
      await resolveMarket(marketPda, { yes: {} }, 90);

      const ata = getAssociatedTokenAddressSync(sbylMint.publicKey, soloUser.publicKey);
      const balBefore = Number((await getAccount(connection, ata)).amount);
      await claimPayout(soloUser, marketPda, nextId, { yes: {} });
      const balAfter = Number((await getAccount(connection, ata)).amount);
      // gross = 500M, fee = 25M, net = 475M
      expect(balAfter - balBefore).to.equal(475_000_000);
    });

    it("Multiple users claiming from same market", async () => {
      const nextId = await getNextMarketId();
      const deadline = Math.floor(Date.now() / 1000) + 5;
      const { marketPda } = await createMarket(nextId, "Multi-claim market", "desc", deadline);

      const claimers = [Keypair.generate(), Keypair.generate()];
      await Promise.all(claimers.map((k) => airdrop(k.publicKey, 5 * LAMPORTS_PER_SOL)));
      await Promise.all(claimers.map((k) => swapToSbyl(k, 2_000_000_000)));

      await placeBet(claimers[0], marketPda, nextId, { yes: {} }, 600_000_000);
      await placeBet(claimers[1], marketPda, nextId, { yes: {} }, 400_000_000);

      const noUser = Keypair.generate();
      await airdrop(noUser.publicKey, 5 * LAMPORTS_PER_SOL);
      await swapToSbyl(noUser, 2_000_000_000);
      await placeBet(noUser, marketPda, nextId, { no: {} }, 1_000_000_000);

      await new Promise((r) => setTimeout(r, 6000));
      await resolveMarket(marketPda, { yes: {} }, 85);

      for (const claimer of claimers) {
        await claimPayout(claimer, marketPda, nextId, { yes: {} });
        const pos = await program.account.position.fetch(getPositionPda(marketPda, claimer.publicKey, { yes: {} })[0]);
        expect(pos.claimed).to.be.true;
      }

      const ata0 = getAssociatedTokenAddressSync(sbylMint.publicKey, claimers[0].publicKey);
      const ata1 = getAssociatedTokenAddressSync(sbylMint.publicKey, claimers[1].publicKey);
      const bal0 = Number((await getAccount(connection, ata0)).amount);
      const bal1 = Number((await getAccount(connection, ata1)).amount);
      expect(bal0).to.equal(2_540_000_000);
      expect(bal1).to.equal(2_360_000_000);
    });
  });
});
