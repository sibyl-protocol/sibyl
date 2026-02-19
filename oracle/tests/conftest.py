"""Shared fixtures for Sibyl Oracle tests."""

import pytest
from src.types import (
    JudgmentResult,
    MarketInfo,
    MarketStatus,
    Outcome,
    ResearchContext,
    SearchResult,
    SourceSummary,
)


@pytest.fixture
def research_context():
    """Empty research context for provider tests."""
    return ResearchContext()


@pytest.fixture
def sample_research_context():
    """Research context with some data."""
    return ResearchContext(
        source_summaries=[
            SourceSummary(url="https://example.com", content="Some evidence text"),
        ],
        search_results=[
            SearchResult(title="Result 1", url="https://search.example.com", snippet="A snippet"),
        ],
    )


@pytest.fixture
def sample_market():
    """A sample MarketInfo for testing."""
    return MarketInfo(
        id=1,
        title="Will BTC reach $100k by end of 2025?",
        description="Resolves Yes if Bitcoin price exceeds $100,000 USD on any major exchange before Jan 1 2026.",
        resolution_deadline=1735689600,
        yes_pool=1_000_000,
        no_pool=500_000,
        status=MarketStatus.LOCKED,
    )


@pytest.fixture
def yes_judgment():
    return JudgmentResult(provider="test-a", outcome=Outcome.YES, confidence=85, reasoning="Evidence supports yes")


@pytest.fixture
def no_judgment():
    return JudgmentResult(provider="test-b", outcome=Outcome.NO, confidence=70, reasoning="Evidence supports no")


@pytest.fixture
def invalid_judgment():
    return JudgmentResult(provider="test-c", outcome=Outcome.INVALID, confidence=50, reasoning="Cannot determine")
