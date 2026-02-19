"""3-model consensus judgment logic for the Sibyl Oracle."""

import asyncio
import logging
from collections import Counter

from .providers import claude, gemini, openai as openai_provider
from .researcher import gather_research
from .types import ConsensusResult, JudgmentResult, Outcome, ResearchContext

logger = logging.getLogger(__name__)

PROVIDERS = [gemini, claude, openai_provider]
TIMEOUT_SECONDS = 120


async def _safe_judge(
    provider_module,
    title: str,
    description: str,
    research: ResearchContext,
) -> JudgmentResult | None:
    """Call a provider's judge function with error/timeout handling."""
    name = getattr(provider_module, "PROVIDER_NAME", provider_module.__name__)
    try:
        result = await asyncio.wait_for(
            provider_module.judge(title, description, research),
            timeout=TIMEOUT_SECONDS,
        )
        logger.info("[%s] outcome=%s confidence=%d", name, result.outcome.value, result.confidence)
        return result
    except asyncio.TimeoutError:
        logger.error("[%s] Timed out after %ds", name, TIMEOUT_SECONDS)
        return None
    except Exception:
        logger.exception("[%s] Failed", name)
        return None


async def run_judgment(
    market_title: str,
    market_description: str,
    sources: list[str] | None = None,
    search_queries: list[str] | None = None,
) -> ConsensusResult:
    """
    Query all 3 AI providers simultaneously and determine consensus.

    Before querying providers, fetches real-time research context from
    source URLs and web searches.

    Consensus rules:
    - 2/3 agreement → that outcome wins; confidence = average of agreeing models
    - All 3 agree → unanimous; confidence = average of all 3
    - All 3 disagree → Invalid
    - Fewer than 2 providers respond → Invalid (insufficient quorum)
    """
    sources = sources or []
    search_queries = search_queries or []

    # Gather research context before sending to providers
    logger.info("Gathering research context (%d sources, %d queries)...", len(sources), len(search_queries))
    research = await gather_research(sources, search_queries)
    logger.info(
        "Research complete: %d source summaries, %d search results",
        len(research.source_summaries),
        len(research.search_results),
    )

    tasks = [_safe_judge(p, market_title, market_description, research) for p in PROVIDERS]
    results = await asyncio.gather(*tasks)

    judgments: list[JudgmentResult] = [r for r in results if r is not None]

    if len(judgments) < 2:
        return ConsensusResult(
            judgments=judgments,
            final_outcome=Outcome.INVALID,
            final_confidence=0,
            consensus_reached=False,
            agreeing_providers=[j.provider for j in judgments],
            summary=f"Insufficient responses ({len(judgments)}/3). Cannot reach consensus.",
        )

    # Count outcomes
    outcome_counts: Counter[Outcome] = Counter(j.outcome for j in judgments)
    most_common_outcome, most_common_count = outcome_counts.most_common(1)[0]

    if most_common_count >= 2:
        agreeing = [j for j in judgments if j.outcome == most_common_outcome]
        avg_confidence = round(sum(j.confidence for j in agreeing) / len(agreeing))
        return ConsensusResult(
            judgments=judgments,
            final_outcome=most_common_outcome,
            final_confidence=avg_confidence,
            consensus_reached=True,
            agreeing_providers=[j.provider for j in agreeing],
            summary=(
                f"Consensus: {most_common_outcome.value} "
                f"({len(agreeing)}/{len(judgments)} agree, confidence {avg_confidence}%)"
            ),
        )

    # All disagree
    return ConsensusResult(
        judgments=judgments,
        final_outcome=Outcome.INVALID,
        final_confidence=0,
        consensus_reached=False,
        agreeing_providers=[],
        summary="No consensus — all providers returned different outcomes.",
    )
