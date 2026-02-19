use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("wQpV3yz4oTyRf4SE3xoZkBjxDTNSHUUUDgqT7YsKfcF");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub const MAX_TITLE_LEN: usize = 200;
pub const MAX_DESC_LEN: usize = 1000;
pub const PROTOCOL_SEED: &[u8] = b"protocol";
pub const MARKET_SEED: &[u8] = b"market";
pub const POSITION_SEED: &[u8] = b"position";
pub const MARKET_VAULT_SEED: &[u8] = b"market_vault";

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

#[program]
pub mod sibyl {
    use super::*;

    /// Initialize the protocol singleton and create the SBYL mint.
    pub fn initialize(
        ctx: Context<Initialize>,
        fee_bps: u16,
        swap_cap: u64,
    ) -> Result<()> {
        require!(fee_bps <= 10_000, SibylError::InvalidFeeBps);
        require!(swap_cap > 0, SibylError::ZeroAmount);

        let protocol = &mut ctx.accounts.protocol;
        protocol.authority = ctx.accounts.authority.key();
        protocol.oracle = ctx.accounts.oracle.key();
        protocol.sbyl_mint = ctx.accounts.sbyl_mint.key();
        protocol.treasury = ctx.accounts.treasury.key();
        protocol.fee_bps = fee_bps;
        protocol.swap_cap = swap_cap;
        protocol.market_count = 0;
        protocol.bump = ctx.bumps.protocol;

        msg!("Sibyl protocol initialized");
        Ok(())
    }

    /// Admin creates a new prediction market.
    pub fn create_market(
        ctx: Context<CreateMarket>,
        title: String,
        description: String,
        resolution_deadline: i64,
    ) -> Result<()> {
        require!(title.len() <= MAX_TITLE_LEN, SibylError::TitleTooLong);
        require!(description.len() <= MAX_DESC_LEN, SibylError::DescriptionTooLong);

        let clock = Clock::get()?;
        require!(
            resolution_deadline > clock.unix_timestamp,
            SibylError::DeadlineInPast
        );

        let protocol = &mut ctx.accounts.protocol;
        let market_id = protocol.market_count;
        protocol.market_count = protocol.market_count.checked_add(1).unwrap();

        let market = &mut ctx.accounts.market;
        market.id = market_id;
        market.authority = protocol.authority;
        market.title = title;
        market.description = description;
        market.resolution_deadline = resolution_deadline;
        market.yes_pool = 0;
        market.no_pool = 0;
        market.status = MarketStatus::Open;
        market.outcome = None;
        market.oracle_confidence = 0;
        market.bump = ctx.bumps.market;

        msg!("Market {} created", market_id);
        Ok(())
    }

    /// User places a bet on Yes or No using SBYL tokens.
    /// Issue #6: Position PDA now includes side, so users can bet on both sides.
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        side: Outcome,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, SibylError::ZeroAmount);

        let market = &mut ctx.accounts.market;
        // Issue #2: Reject bets if market is Locked or not Open
        require!(market.status == MarketStatus::Open, SibylError::MarketNotOpen);

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp < market.resolution_deadline,
            SibylError::MarketExpired
        );

        // Transfer SBYL from user to market vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.market_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        // Update market pools
        match side {
            Outcome::Yes => market.yes_pool = market.yes_pool.checked_add(amount).unwrap(),
            Outcome::No => market.no_pool = market.no_pool.checked_add(amount).unwrap(),
            Outcome::Invalid => return Err(SibylError::InvalidBetSide.into()),
        }

        // Update or initialize position
        let position = &mut ctx.accounts.position;
        if position.amount == 0 {
            // New position
            position.owner = ctx.accounts.user.key();
            position.market = market.key();
            position.side = side;
            position.amount = amount;
            position.claimed = false;
            position.bump = ctx.bumps.position;
        } else {
            // Existing position — must be same side (enforced by PDA seeds including side)
            require!(position.side == side, SibylError::SideMismatch);
            position.amount = position.amount.checked_add(amount).unwrap();
        }

        msg!("Bet placed: {} SBYL on {:?}", amount, side);
        Ok(())
    }

    /// Oracle resolves a market with AI judgment.
    /// Issue #1: Cannot resolve before deadline.
    /// Issue #2: Auto-transitions Open → Locked → Resolved.
    pub fn resolve(
        ctx: Context<Resolve>,
        outcome: Outcome,
        confidence: u8,
    ) -> Result<()> {
        require!(confidence <= 100, SibylError::InvalidConfidence);

        let market = &mut ctx.accounts.market;
        require!(
            market.status == MarketStatus::Open || market.status == MarketStatus::Locked,
            SibylError::MarketNotResolvable
        );

        // Issue #1: Oracle cannot resolve before deadline
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= market.resolution_deadline,
            SibylError::DeadlineNotReached
        );

        // Issue #2: Auto-transition Open → Locked → Resolved
        if market.status == MarketStatus::Open {
            market.status = MarketStatus::Locked;
        }

        market.status = MarketStatus::Resolved;
        market.outcome = Some(outcome);
        market.oracle_confidence = confidence;

        msg!("Market {} resolved: {:?} (confidence {}%)", market.id, outcome, confidence);
        Ok(())
    }

    /// Winner claims payout after market resolution.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let market = &ctx.accounts.market;
        require!(market.status == MarketStatus::Resolved, SibylError::MarketNotResolved);

        let position = &mut ctx.accounts.position;
        require!(!position.claimed, SibylError::AlreadyClaimed);

        let outcome = market.outcome.as_ref().unwrap();

        // Handle Invalid outcome — everyone gets refund proportional to their bet
        let (payout, fee_amount) = if *outcome == Outcome::Invalid {
            let total_pool = market.yes_pool.checked_add(market.no_pool).unwrap();
            let refund = (position.amount as u128)
                .checked_mul(total_pool as u128)
                .unwrap()
                .checked_div(
                    match position.side {
                        Outcome::Yes => market.yes_pool,
                        Outcome::No => market.no_pool,
                        Outcome::Invalid => return Err(SibylError::InvalidBetSide.into()),
                    } as u128,
                )
                .unwrap_or(0);
            (refund as u64, 0u64)
        } else {
            // Must be on winning side
            require!(position.side == *outcome, SibylError::NotWinner);

            let total_pool = market.yes_pool.checked_add(market.no_pool).unwrap();
            let winning_pool = match outcome {
                Outcome::Yes => market.yes_pool,
                Outcome::No => market.no_pool,
                Outcome::Invalid => unreachable!(),
            };

            let protocol = &ctx.accounts.protocol;
            let gross = (position.amount as u128)
                .checked_mul(total_pool as u128)
                .unwrap()
                .checked_div(winning_pool as u128)
                .unwrap_or(0);
            let fee = gross
                .checked_mul(protocol.fee_bps as u128)
                .unwrap()
                .checked_div(10_000)
                .unwrap_or(0);
            let net = gross.checked_sub(fee).unwrap_or(0);

            (net as u64, fee as u64)
        };

        require!(payout > 0, SibylError::NoPayout);

        // Transfer payout from vault to user
        let market_id_bytes = market.id.to_le_bytes();
        let seeds: &[&[u8]] = &[MARKET_VAULT_SEED, market_id_bytes.as_ref(), &[ctx.bumps.market_vault]];
        let signer_seeds = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.market_vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.market_vault.to_account_info(),
                },
                signer_seeds,
            ),
            payout,
        )?;

        // Transfer fee to treasury if any
        if fee_amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.market_vault.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                        authority: ctx.accounts.market_vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                fee_amount,
            )?;
        }

        position.claimed = true;

        msg!("Claimed {} SBYL (fee: {})", payout, fee_amount);
        Ok(())
    }

    /// Swap SOL for SBYL tokens (simplified: mint SBYL 1:1 for lamports sent).
    ///
    /// ⚠️ RISK: This is an infinite mint in MVP — anyone can mint SBYL by sending SOL.
    /// In production, replace with a proper AMM, bonding curve, or price oracle.
    /// The `swap_cap` field on Protocol limits the max SBYL minted per transaction.
    pub fn swap_to_sbyl(ctx: Context<SwapToSbyl>, sol_amount: u64) -> Result<()> {
        require!(sol_amount > 0, SibylError::ZeroAmount);

        // Issue #5: Enforce per-transaction swap cap
        let protocol = &ctx.accounts.protocol;
        require!(sol_amount <= protocol.swap_cap, SibylError::SwapCapExceeded);

        // Transfer SOL from user to treasury
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.treasury.key(),
            sol_amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
            ],
        )?;

        // Mint SBYL to user (1:1 ratio for MVP)
        let bump = protocol.bump;
        let seeds: &[&[u8]] = &[PROTOCOL_SEED, &[bump]];
        let signer_seeds = &[seeds];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.sbyl_mint.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                signer_seeds,
            ),
            sol_amount,
        )?;

        msg!("Swapped {} lamports for {} SBYL", sol_amount, sol_amount);
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Protocol::INIT_SPACE,
        seeds = [PROTOCOL_SEED],
        bump,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 9,
        mint::authority = protocol,
    )]
    pub sbyl_mint: Account<'info, Mint>,

    /// CHECK: Treasury wallet to receive fees. Validated by admin at init time.
    pub treasury: AccountInfo<'info>,

    /// CHECK: Oracle signer pubkey. Validated by admin at init time.
    pub oracle: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CreateMarket<'info> {
    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        has_one = authority,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [MARKET_SEED, &protocol.market_count.to_le_bytes()],
        bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = authority,
        token::mint = sbyl_mint,
        token::authority = market_vault,
        seeds = [MARKET_VAULT_SEED, &protocol.market_count.to_le_bytes()],
        bump,
    )]
    pub market_vault: Account<'info, TokenAccount>,

    pub sbyl_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

/// Issue #6: Position PDA seeds now include side byte for both-side betting.
#[derive(Accounts)]
#[instruction(side: Outcome)]
pub struct PlaceBet<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED, &market.id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, market.key().as_ref(), user.key().as_ref(), &[side.to_u8()]],
        bump,
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        seeds = [MARKET_VAULT_SEED, &market.id.to_le_bytes()],
        bump,
    )]
    pub market_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Resolve<'info> {
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        has_one = oracle,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        mut,
        seeds = [MARKET_SEED, &market.id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    pub oracle: Signer<'info>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        seeds = [MARKET_SEED, &market.id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [POSITION_SEED, market.key().as_ref(), user.key().as_ref(), &[position.side.to_u8()]],
        bump = position.bump,
        constraint = position.owner == user.key() @ SibylError::NotPositionOwner,
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        seeds = [MARKET_VAULT_SEED, &market.id.to_le_bytes()],
        bump,
    )]
    pub market_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Issue #4: Treasury must be a SBYL token account owned by the protocol treasury wallet.
    #[account(
        mut,
        token::mint = market_vault.mint,
        constraint = treasury.owner == protocol.treasury @ SibylError::TreasuryMismatch,
    )]
    pub treasury: Account<'info, TokenAccount>,

    #[account(address = position.owner)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SwapToSbyl<'info> {
    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        mut,
        address = protocol.sbyl_mint,
    )]
    pub sbyl_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    /// CHECK: Treasury SOL account.
    #[account(mut, address = protocol.treasury)]
    pub treasury: AccountInfo<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Protocol {
    pub authority: Pubkey,
    pub oracle: Pubkey,
    pub sbyl_mint: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    /// Issue #5: Maximum SBYL that can be minted per swap transaction.
    pub swap_cap: u64,
    pub market_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub id: u64,
    pub authority: Pubkey,
    #[max_len(200)]
    pub title: String,
    #[max_len(1000)]
    pub description: String,
    pub resolution_deadline: i64,
    pub yes_pool: u64,
    pub no_pool: u64,
    pub status: MarketStatus,
    pub outcome: Option<Outcome>,
    pub oracle_confidence: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub side: Outcome,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum MarketStatus {
    Open,
    Locked,
    Resolved,
    /// Issue #3: Settled is reserved for future use. In a production system,
    /// this would be set after all winning positions have been claimed and the
    /// market vault is empty. For MVP, we skip automatic Settled transitions.
    Settled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Outcome {
    Yes,
    No,
    Invalid,
}

impl Outcome {
    pub fn to_u8(&self) -> u8 {
        match self {
            Outcome::Yes => 0,
            Outcome::No => 1,
            Outcome::Invalid => 2,
        }
    }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum SibylError {
    #[msg("Fee basis points must be <= 10000")]
    InvalidFeeBps,
    #[msg("Title exceeds maximum length")]
    TitleTooLong,
    #[msg("Description exceeds maximum length")]
    DescriptionTooLong,
    #[msg("Resolution deadline must be in the future")]
    DeadlineInPast,
    #[msg("Market is not open for betting")]
    MarketNotOpen,
    #[msg("Market has expired")]
    MarketExpired,
    #[msg("Bet amount must be greater than zero")]
    ZeroAmount,
    #[msg("Cannot bet Invalid as a side")]
    InvalidBetSide,
    #[msg("Position side does not match")]
    SideMismatch,
    #[msg("Confidence must be 0-100")]
    InvalidConfidence,
    #[msg("Market cannot be resolved in current state")]
    MarketNotResolvable,
    #[msg("Market is not yet resolved")]
    MarketNotResolved,
    #[msg("Position already claimed")]
    AlreadyClaimed,
    #[msg("Not on the winning side")]
    NotWinner,
    #[msg("No payout available")]
    NoPayout,
    #[msg("Not the position owner")]
    NotPositionOwner,
    #[msg("Resolution deadline has not been reached yet")]
    DeadlineNotReached,
    #[msg("Swap amount exceeds per-transaction cap")]
    SwapCapExceeded,
    #[msg("Treasury account does not match protocol treasury")]
    TreasuryMismatch,
}
