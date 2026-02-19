import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { Sibyl } from "../target/types/sibyl";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sibyl as Program<Sibyl>;
  const authority = provider.wallet;

  console.log("=== Sibyl E2E on Devnet ===");
  console.log("Authority:", authority.publicKey.toBase58());
  console.log("Program:", program.programId.toBase58());

  const [protocolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")], program.programId
  );

  // Fetch protocol state
  const protocol = await program.account.protocol.fetch(protocolPda);
  const sbylMint = protocol.sbylMint;
  const treasury = protocol.treasury;
  console.log("\nProtocol already initialized:");
  console.log("  SBYL Mint:", sbylMint.toBase58());
  console.log("  Treasury:", treasury.toBase58());
  console.log("  Oracle:", protocol.oracle.toBase58());
  console.log("  Fee:", protocol.feeBps, "bps");
  console.log("  Market count:", protocol.marketCount.toString());

  // Find existing market 0
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), new anchor.BN(0).toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  const [marketVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market_vault"), new anchor.BN(0).toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  const market = await program.account.market.fetch(marketPda);
  console.log("\nMarket #0:");
  console.log("  Title:", market.title);
  console.log("  Status:", JSON.stringify(market.status));
  console.log("  Yes pool:", market.yesPool.toString());
  console.log("  No pool:", market.noPool.toString());

  // Ensure user has ATA
  console.log("\n--- Swap SOL → SBYL ---");
  const userAta = await getAssociatedTokenAddress(sbylMint, authority.publicKey);
  try {
    await getAccount(provider.connection, userAta);
    console.log("  ATA exists:", userAta.toBase58());
  } catch {
    const createAtaIx = createAssociatedTokenAccountInstruction(
      authority.publicKey, userAta, authority.publicKey, sbylMint
    );
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(createAtaIx));
    console.log("  ATA created:", userAta.toBase58());
  }

  const swapTx = await program.methods
    .swapToSbyl(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
    .accounts({
      sbylMint: sbylMint,
      userTokenAccount: userAta,
      treasury: treasury,
    } as any)
    .rpc();
  console.log("✅ Swapped 0.1 SOL → SBYL:", swapTx);

  // Place bet
  console.log("\n--- Place Bet (Yes, 0.05 SBYL) ---");
  const [positionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), marketPda.toBuffer(), authority.publicKey.toBuffer(), Buffer.from([0])],
    program.programId
  );

  const betTx = await program.methods
    .placeBet({ yes: {} } as any, new anchor.BN(50_000_000))
    .accounts({
      market: marketPda,
      position: positionPda,
      marketVault: marketVaultPda,
      userTokenAccount: userAta,
    } as any)
    .rpc();
  console.log("✅ Bet placed:", betTx);

  // Verify final state
  const marketFinal = await program.account.market.fetch(marketPda);
  console.log("\n--- Final State ---");
  console.log("  Yes pool:", marketFinal.yesPool.toString());
  console.log("  No pool:", marketFinal.noPool.toString());

  const position = await program.account.position.fetch(positionPda);
  console.log("  Position amount:", position.amount.toString());
  console.log("  Position side:", JSON.stringify(position.side));

  console.log("\n=== 🎉 E2E Complete! ===");
}

main().catch(console.error);
