"""Tests for src.judge — consensus logic."""

import pytest
from unittest.mock import AsyncMock, patch

from src.judge import run_judgment
from src.types import JudgmentResult, Outcome, ResearchContext


def _make_judgment(provider: str, outcome: Outcome, confidence: int) -> JudgmentResult:
    return JudgmentResult(
        provider=provider,
        outcome=outcome,
        confidence=confidence,
        reasoning=f"{provider} says {outcome.value}",
    )


def _patch_providers(*judgments_or_none):
    """Patch the 3 provider modules' judge functions. None = raise exception."""
    mocks = []
    for j in judgments_or_none:
        m = AsyncMock()
        if j is None:
            m.side_effect = Exception("Provider failed")
        else:
            m.return_value = j
        mocks.append(m)
    return (
        patch("src.judge.gemini.judge", mocks[0]),
        patch("src.judge.claude.judge", mocks[1]),
        patch("src.judge.openai_provider.judge", mocks[2]),
        patch("src.judge.gather_research", AsyncMock(return_value=ResearchContext())),
    )


@pytest.mark.asyncio
async def test_unanimous_yes():
    """3/3 Yes → consensus Yes."""
    j1 = _make_judgment("gemini", Outcome.YES, 90)
    j2 = _make_judgment("claude", Outcome.YES, 80)
    j3 = _make_judgment("openai", Outcome.YES, 85)
    patches = _patch_providers(j1, j2, j3)
    with patches[0], patches[1], patches[2], patches[3]:
        result = await run_judgment("Test", "Desc")
    assert result.final_outcome == Outcome.YES
    assert result.consensus_reached is True
    assert result.final_confidence == 85  # avg(90,80,85)
    assert len(result.agreeing_providers) == 3


@pytest.mark.asyncio
async def test_majority_yes():
    """2 Yes, 1 No → consensus Yes."""
    j1 = _make_judgment("gemini", Outcome.YES, 90)
    j2 = _make_judgment("claude", Outcome.YES, 80)
    j3 = _make_judgment("openai", Outcome.NO, 60)
    patches = _patch_providers(j1, j2, j3)
    with patches[0], patches[1], patches[2], patches[3]:
        result = await run_judgment("Test", "Desc")
    assert result.final_outcome == Outcome.YES
    assert result.consensus_reached is True
    assert result.final_confidence == 85  # avg(90,80)


@pytest.mark.asyncio
async def test_majority_no():
    """2 No, 1 Yes → consensus No."""
    j1 = _make_judgment("gemini", Outcome.NO, 70)
    j2 = _make_judgment("claude", Outcome.NO, 80)
    j3 = _make_judgment("openai", Outcome.YES, 60)
    patches = _patch_providers(j1, j2, j3)
    with patches[0], patches[1], patches[2], patches[3]:
        result = await run_judgment("Test", "Desc")
    assert result.final_outcome == Outcome.NO
    assert result.consensus_reached is True
    assert result.final_confidence == 75  # avg(70,80)


@pytest.mark.asyncio
async def test_all_disagree():
    """Yes, No, Invalid → Invalid, no consensus."""
    j1 = _make_judgment("gemini", Outcome.YES, 80)
    j2 = _make_judgment("claude", Outcome.NO, 70)
    j3 = _make_judgment("openai", Outcome.INVALID, 50)
    patches = _patch_providers(j1, j2, j3)
    with patches[0], patches[1], patches[2], patches[3]:
        result = await run_judgment("Test", "Desc")
    assert result.final_outcome == Outcome.INVALID
    assert result.consensus_reached is False


@pytest.mark.asyncio
async def test_one_provider_fails_with_agreement():
    """1 fails, 2 agree → still reaches consensus."""
    j1 = _make_judgment("gemini", Outcome.YES, 90)
    j2 = _make_judgment("claude", Outcome.YES, 80)
    patches = _patch_providers(j1, j2, None)  # openai fails
    with patches[0], patches[1], patches[2], patches[3]:
        result = await run_judgment("Test", "Desc")
    assert result.final_outcome == Outcome.YES
    assert result.consensus_reached is True
    assert len(result.judgments) == 2


@pytest.mark.asyncio
async def test_only_one_responds():
    """Only 1 provider responds → insufficient quorum."""
    j1 = _make_judgment("gemini", Outcome.YES, 90)
    patches = _patch_providers(j1, None, None)
    with patches[0], patches[1], patches[2], patches[3]:
        result = await run_judgment("Test", "Desc")
    assert result.final_outcome == Outcome.INVALID
    assert result.consensus_reached is False
    assert "Insufficient" in result.summary


@pytest.mark.asyncio
async def test_zero_responses():
    """0 providers respond → insufficient quorum."""
    patches = _patch_providers(None, None, None)
    with patches[0], patches[1], patches[2], patches[3]:
        result = await run_judgment("Test", "Desc")
    assert result.final_outcome == Outcome.INVALID
    assert result.consensus_reached is False
    assert len(result.judgments) == 0


@pytest.mark.asyncio
async def test_confidence_averaging():
    """Verify confidence is averaged only across agreeing providers."""
    j1 = _make_judgment("gemini", Outcome.YES, 100)
    j2 = _make_judgment("claude", Outcome.YES, 60)
    j3 = _make_judgment("openai", Outcome.NO, 90)
    patches = _patch_providers(j1, j2, j3)
    with patches[0], patches[1], patches[2], patches[3]:
        result = await run_judgment("Test", "Desc")
    assert result.final_outcome == Outcome.YES
    # avg of agreeing (100 + 60) / 2 = 80, NOT including the No provider
    assert result.final_confidence == 80
