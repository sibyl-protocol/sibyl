# Sibyl — Smart Contract Design

## Overview

Sibyl is an AI Oracle × Prediction Market protocol on Solana. Users bet SBYL tokens on Yes/No outcomes, and an AI oracle network resolves markets. This document describes the on-chain program architecture.

**Program framework:** Anchor 0.32.1  
**Token standard:** SPL Token  
**Chain:** Solana (SBF)

---

## Data Structures

### Protocol (PDA)

Singleton account storing global protocol configuration.

| Field | Type | Description |
|-------|------|-------------|
| authority | Pubkey | Admin who can create markets and update config |
| oracle | Pubkey | Oracle bot signer authorized to resolve markets |
| sbyl_mint | Pubkey | SBYL SPL token mint address |
| treasury | Pubkey | Fee collection wallet |
| fee_bps | u16 | Fee in basis points (e.g. 200 = 2%) |
| market_count | u64 | Sequential market ID counter |
| bump | u8 | PDA bump seed |

**Seeds:** `[b"protocol"]`  
**Space:** 8 (discriminator) + 32×4 + 2 + 8 + 1 = 139 bytes (with InitSpace derive)

### Market (PDA)

Each prediction market is its own account.

| Field | Type | Description |
|-------|------|-------------|
| id | u64 | Sequential market ID |
| authority | Pubkey | Protocol admin at creation time |
| title | String | Market question (max 200 chars) |
| description | String | Detailed description and resolution criteria (max 1000 chars) |
| resolution_deadline | i64 | Unix timestamp after which oracle can resolve |
| yes_pool | u64 | Total SBYL tokens bet on Yes |
| no_pool | u64 | Total SBYL tokens bet on No |
| status | MarketStatus | Current market state |
| outcome | Option\<Outcome\> | Final resolution result |
| oracle_confidence | u8 | AI confidence score 0-100 |
| bump | u8 | PDA bump seed |

**Seeds:** `[b"market", market_id.to_le_bytes()]`

#### MarketStatus Enum

| Variant | Description |
|---------|-------------|
| Open | Accepting bets |
| Locked | No more bets; awaiting resolution |
| Resolved | Oracle has submitted judgment |
| Settled | All claims processed (future use) |

#### Outcome Enum

| Variant | Description |
|---------|-------------|
| Yes | Affirmative outcome |
| No | Negative outcome |
| Invalid | Market voided (refund scenario) |

### Position (PDA)

Tracks a user's bet in a specific market. One position per user per market.

| Field | Type | Description |
|-------|------|-------------|
| owner | Pubkey | User who placed the bet |
| market | Pubkey | Market account address |
| side | Outcome | Yes or No |
| amount | u64 | Total SBYL wagered |
| claimed | bool | Whether payout has been claimed |
| bump | u8 | PDA bump seed |

**Seeds:** `[b"position", market_pubkey, owner_pubkey]`

### Market Vault (PDA Token Account)

Each market has an associated SPL token account holding all bet funds.

**Seeds:** `[b"market_vault", market_id.to_le_bytes()]`  
**Authority:** Self (PDA-signed transfers)

---

## Instructions

### 1. `initialize`

Creates the Protocol singleton and SBYL mint.

**Signers:** authority (admin)  
**Accounts:**
- `protocol` — PDA, init
- `sbyl_mint` — new Mint account, authority = protocol PDA
- `treasury` — unchecked, admin-provided
- `oracle` — unchecked, admin-provided
- `authority` — signer, payer

**Args:**
- `fee_bps: u16` — protocol fee (≤ 10000)

### 2. `create_market`

Admin creates a new prediction market.

**Signers:** authority (must match protocol.authority)  
**Accounts:**
- `protocol` — mutable, has_one = authority
- `market` — PDA, init
- `market_vault` — PDA token account, init
- `sbyl_mint` — for vault initialization
- `authority` — signer, payer

**Args:**
- `title: String` — market question (≤ 200 chars)
- `description: String` — details (≤ 1000 chars)
- `resolution_deadline: i64` — must be in the future

**Effects:** Increments `protocol.market_count`.

### 3. `place_bet`

User bets SBYL tokens on Yes or No.

**Signers:** user  
**Accounts:**
- `market` — mutable, must be Open and before deadline
- `position` — PDA, init_if_needed (allows adding to existing position on same side)
- `market_vault` — receives tokens
- `user_token_account` — user's SBYL token account
- `user` — signer, payer

**Args:**
- `side: Outcome` — Yes or No (not Invalid)
- `amount: u64` — SBYL amount (> 0)

**Constraints:**
- Market must be Open
- Current time must be before resolution_deadline
- If position exists, side must match
- Cannot bet Invalid

### 4. `resolve`

Oracle submits AI judgment result.

**Signers:** oracle (must match protocol.oracle)  
**Accounts:**
- `protocol` — has_one = oracle
- `market` — mutable, must be Open or Locked

**Args:**
- `outcome: Outcome` — Yes, No, or Invalid
- `confidence: u8` — 0-100

**Effects:** Sets market status to Resolved.

### 5. `claim`

Winner withdraws payout from the market vault.

**Signers:** user (must be position owner)  
**Accounts:**
- `protocol` — for fee_bps
- `market` — must be Resolved
- `position` — mutable, must not be already claimed
- `market_vault` — PDA-signed transfer source
- `user_token_account` — receives payout
- `treasury` — receives fee portion

**Payout Formula:**
```
gross_payout = (user_bet / winning_pool) × total_pool
fee = gross_payout × fee_bps / 10000
net_payout = gross_payout - fee
```

**Invalid Outcome:** All users receive proportional refund (no fee).

### 6. `swap_to_sbyl`

Converts SOL to SBYL tokens (simplified 1:1 for MVP).

**Signers:** user  
**Accounts:**
- `protocol` — for mint authority (PDA signer)
- `sbyl_mint` — mutable
- `user_token_account` — receives minted SBYL
- `treasury` — receives SOL
- `user` — signer, payer

**Args:**
- `sol_amount: u64` — lamports to swap

**Note:** MVP uses 1:1 ratio. Production would integrate a proper AMM or price feed.

---

## PDA Seed Summary

| Account | Seeds | Bump stored |
|---------|-------|-------------|
| Protocol | `[b"protocol"]` | protocol.bump |
| Market | `[b"market", market_id (u64 LE)]` | market.bump |
| Position | `[b"position", market_pubkey, owner_pubkey]` | position.bump |
| Market Vault | `[b"market_vault", market_id (u64 LE)]` | derived at use |

---

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | InvalidFeeBps | Fee > 10000 |
| 6001 | TitleTooLong | Title > 200 chars |
| 6002 | DescriptionTooLong | Description > 1000 chars |
| 6003 | DeadlineInPast | Resolution deadline not in future |
| 6004 | MarketNotOpen | Bet attempted on non-Open market |
| 6005 | MarketExpired | Bet after deadline |
| 6006 | ZeroAmount | Zero bet amount |
| 6007 | InvalidBetSide | Bet on Invalid |
| 6008 | SideMismatch | Adding to position on different side |
| 6009 | InvalidConfidence | Confidence > 100 |
| 6010 | MarketNotResolvable | Resolve on wrong market status |
| 6011 | MarketNotResolved | Claim before resolution |
| 6012 | AlreadyClaimed | Double claim |
| 6013 | NotWinner | Claim from losing side |
| 6014 | NoPayout | Calculated payout is zero |
| 6015 | NotPositionOwner | Signer ≠ position owner |

---

## Security Considerations

1. **Re-initialization attacks:** Protocol PDA is unique (single seed), preventing duplicate init.
2. **init_if_needed on Position:** Position is keyed by (market, owner) so re-init would require same user on same market. Side mismatch check prevents abuse.
3. **Oracle trust:** Single oracle signer for MVP. Multi-sig or threshold oracle planned for v2.
4. **Integer overflow:** All arithmetic uses `checked_add`/`checked_mul`/`checked_sub`/`checked_div`.
5. **PDA authority:** Market vaults are self-authoritative PDAs; only program can sign transfers.

---

## Future Enhancements (v2+)

- **Dispute mechanism:** Challenge period after resolution with human escalation
- **Multi-oracle consensus:** On-chain aggregation of multiple oracle votes
- **Dynamic fee tiers:** Volume-based or market-specific fees
- **Market creation by users:** With stake/bond requirements
- **USDC integration:** Direct USDC betting alongside SBYL
- **AMM-based swap:** Replace 1:1 swap with constant-product or oracle-priced swap
