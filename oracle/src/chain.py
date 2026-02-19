"""Solana on-chain integration for the Sibyl Oracle.

Submits `resolve` transactions to the Sibyl program and reads market data.
Uses solders for keypair/transaction handling and solana-py for RPC.
"""

import hashlib
import json
import logging
import os
import struct
from pathlib import Path

from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed
from solana.rpc.types import TxOpts
from solders.hash import Hash  # noqa: F401
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.transaction import Transaction

from .types import MarketInfo, MarketStatus, Outcome

logger = logging.getLogger(__name__)

# Must match declare_id! in lib.rs
PROGRAM_ID = Pubkey.from_string("CzTVSkqAttKbsG17JqgzhsSyXiVVTf7Q5eNCd6X9bB3W")

PROTOCOL_SEED = b"protocol"
MARKET_SEED = b"market"

# Anchor instruction discriminators are the first 8 bytes of
# sha256('global:snake_case_instruction_name').


def compute_discriminator(instruction_name: str) -> bytes:
    """Compute an Anchor instruction discriminator from its snake_case name."""
    return hashlib.sha256(f"global:{instruction_name}".encode()).digest()[:8]


RESOLVE_DISCRIMINATOR = compute_discriminator("resolve")

MAX_RETRIES = 3
DEFAULT_RPC = "https://api.devnet.solana.com"


def load_keypair() -> Keypair:
    """Load the oracle keypair from a JSON file (Solana CLI format)."""
    path = os.environ.get("ORACLE_KEYPAIR_PATH")
    if not path:
        raise ValueError("ORACLE_KEYPAIR_PATH environment variable is required")

    data = json.loads(Path(path).read_text())
    return Keypair.from_bytes(bytes(data[:64]))


def get_rpc_url() -> str:
    return os.environ.get("SOLANA_RPC_URL", DEFAULT_RPC)


def derive_protocol_pda() -> tuple[Pubkey, int]:
    return Pubkey.find_program_address([PROTOCOL_SEED], PROGRAM_ID)


def derive_market_pda(market_id: int) -> tuple[Pubkey, int]:
    return Pubkey.find_program_address(
        [MARKET_SEED, market_id.to_bytes(8, "little")],
        PROGRAM_ID,
    )


async def fetch_market(client: AsyncClient, market_id: int) -> MarketInfo:
    """Fetch and deserialize a Market account from chain."""
    market_pda, _ = derive_market_pda(market_id)
    resp = await client.get_account_info(market_pda, commitment=Confirmed)

    if resp.value is None:
        raise ValueError(f"Market {market_id} not found on chain")

    data = resp.value.data
    # Skip 8-byte Anchor discriminator
    offset = 8

    # id: u64
    mid = struct.unpack_from("<Q", data, offset)[0]
    offset += 8

    # authority: Pubkey (32 bytes) — skip
    offset += 32

    # title: String (4-byte len prefix + utf8)
    title_len = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    title = data[offset : offset + title_len].decode("utf-8")
    offset += title_len

    # description: String
    desc_len = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    description = data[offset : offset + desc_len].decode("utf-8")
    offset += desc_len

    # resolution_deadline: i64
    resolution_deadline = struct.unpack_from("<q", data, offset)[0]
    offset += 8

    # yes_pool: u64
    yes_pool = struct.unpack_from("<Q", data, offset)[0]
    offset += 8

    # no_pool: u64
    no_pool = struct.unpack_from("<Q", data, offset)[0]
    offset += 8

    # status: u8 enum
    status_val = data[offset]
    offset += 1
    status = [MarketStatus.OPEN, MarketStatus.LOCKED, MarketStatus.RESOLVED, MarketStatus.SETTLED][status_val]

    # outcome: Option<Outcome> (1 byte tag + optional 1 byte)
    has_outcome = data[offset]
    offset += 1
    outcome = None
    if has_outcome == 1:
        outcome_val = data[offset]
        outcome = [Outcome.YES, Outcome.NO, Outcome.INVALID][outcome_val]
        offset += 1

    # oracle_confidence: u8
    oracle_confidence = data[offset]

    return MarketInfo(
        id=mid,
        title=title,
        description=description,
        resolution_deadline=resolution_deadline,
        yes_pool=yes_pool,
        no_pool=no_pool,
        status=status,
        outcome=outcome,
        oracle_confidence=oracle_confidence,
    )


async def submit_resolve(
    market_id: int,
    outcome: Outcome,
    confidence: int,
) -> str:
    """
    Submit a `resolve` transaction to the Sibyl program.

    Returns the transaction signature on success.
    """
    keypair = load_keypair()
    rpc_url = get_rpc_url()

    protocol_pda, _ = derive_protocol_pda()
    market_pda, _ = derive_market_pda(market_id)

    # Encode instruction data: discriminator + outcome (u8 enum) + confidence (u8)
    outcome_byte = outcome.to_chain_value()
    ix_data = RESOLVE_DISCRIMINATOR + bytes([outcome_byte]) + bytes([confidence])

    ix = Instruction(
        program_id=PROGRAM_ID,
        accounts=[
            AccountMeta(protocol_pda, is_signer=False, is_writable=False),
            AccountMeta(market_pda, is_signer=False, is_writable=True),
            AccountMeta(keypair.pubkey(), is_signer=True, is_writable=False),
        ],
        data=ix_data,
    )

    async with AsyncClient(rpc_url) as client:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                blockhash_resp = await client.get_latest_blockhash(commitment=Confirmed)
                recent_blockhash = blockhash_resp.value.blockhash

                msg = Message.new_with_blockhash([ix], keypair.pubkey(), recent_blockhash)
                tx = Transaction.new_unsigned(msg)
                tx.sign([keypair], recent_blockhash)

                resp = await client.send_transaction(
                    tx,
                    opts=TxOpts(skip_preflight=False, preflight_commitment=Confirmed),
                )

                sig = str(resp.value)
                logger.info("Resolve tx sent (attempt %d): %s", attempt, sig)

                # Confirm
                await client.confirm_transaction(resp.value, commitment=Confirmed)
                logger.info("Resolve tx confirmed: %s", sig)
                return sig

            except Exception:
                logger.exception("Resolve tx attempt %d/%d failed", attempt, MAX_RETRIES)
                if attempt == MAX_RETRIES:
                    raise

    raise RuntimeError("Unreachable")
