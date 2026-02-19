"""
Sibyl Oracle — CLI entry point.

Usage:
    python -m oracle.src.main --market-id 0
    python -m oracle.src.main --market-id 0 --dry-run
"""

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed

from .chain import fetch_market, get_rpc_url, submit_resolve
from .judge import run_judgment
from .types import MarketStatus, ResolveReport

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def resolve_market(market_id: int, dry_run: bool = False) -> ResolveReport:
    """Full resolution pipeline: fetch → judge → submit."""

    # 1. Fetch market from chain
    logger.info("Fetching market %d from chain...", market_id)
    rpc_url = get_rpc_url()
    async with AsyncClient(rpc_url) as client:
        market = await fetch_market(client, market_id)

    logger.info("Market: %s", market.title)
    logger.info("Status: %s | Deadline: %d", market.status.value, market.resolution_deadline)
    logger.info("Pools: YES=%d / NO=%d", market.yes_pool, market.no_pool)

    if market.status not in (MarketStatus.OPEN, MarketStatus.LOCKED):
        return ResolveReport(
            market_id=market_id,
            market_title=market.title,
            consensus=None,  # type: ignore[arg-type]
            error=f"Market is already {market.status.value}, cannot resolve.",
        )

    # 2. Load market-specific sources from config
    markets_config_path = Path(__file__).resolve().parent.parent / "markets.json"
    sources: list[str] = []
    search_queries: list[str] = []

    if markets_config_path.exists():
        try:
            markets_config = json.loads(markets_config_path.read_text())
            market_cfg = markets_config.get(str(market_id), {})
            sources = market_cfg.get("sources", [])
            search_queries = market_cfg.get("search_queries", [])
        except Exception:
            logger.warning("Failed to load markets.json, using defaults")

    # Fall back to using market title as search query if no config
    if not search_queries:
        search_queries = [market.title]

    # 3. Run AI judgment
    logger.info("Running AI judgment with 3 providers...")
    consensus = await run_judgment(market.title, market.description, sources, search_queries)

    # Print detailed report
    print("\n" + "=" * 60)
    print("SIBYL ORACLE — JUDGMENT REPORT")
    print("=" * 60)
    print(f"Market #{market_id}: {market.title}\n")

    for j in consensus.judgments:
        print(f"  [{j.provider}]")
        print(f"    Outcome:    {j.outcome.value}")
        print(f"    Confidence: {j.confidence}%")
        print(f"    Reasoning:  {j.reasoning}")
        print()

    print(f"  CONSENSUS: {consensus.summary}")
    print(f"  Final:     {consensus.final_outcome.value} ({consensus.final_confidence}%)")
    print("=" * 60 + "\n")

    # 4. Submit on-chain
    tx_sig = None
    error = None

    if dry_run:
        logger.info("Dry run — skipping on-chain submission.")
    else:
        try:
            logger.info(
                "Submitting resolve tx: outcome=%s, confidence=%d",
                consensus.final_outcome.value,
                consensus.final_confidence,
            )
            tx_sig = await submit_resolve(
                market_id,
                consensus.final_outcome,
                consensus.final_confidence,
            )
            logger.info("✅ Transaction confirmed: %s", tx_sig)
        except Exception as e:
            logger.exception("Failed to submit resolve transaction")
            error = str(e)

    return ResolveReport(
        market_id=market_id,
        market_title=market.title,
        consensus=consensus,
        tx_signature=tx_sig,
        error=error,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Sibyl Oracle — AI Prediction Market Resolver")
    parser.add_argument("--market-id", type=int, required=True, help="On-chain market ID to resolve")
    parser.add_argument("--dry-run", action="store_true", help="Run judgment without submitting tx")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    load_dotenv()

    report = asyncio.run(resolve_market(args.market_id, dry_run=args.dry_run))

    if report.error:
        logger.error("Resolution failed: %s", report.error)
        sys.exit(1)

    if report.tx_signature:
        print(f"\n🔗 Transaction: {report.tx_signature}")


if __name__ == "__main__":
    main()
