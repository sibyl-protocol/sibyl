"""Shared types and data models for the Sibyl Oracle service."""

from enum import Enum
from pydantic import BaseModel, Field


class Outcome(str, Enum):
    """Market outcome matching the on-chain Outcome enum."""
    YES = "Yes"
    NO = "No"
    INVALID = "Invalid"

    def to_chain_value(self) -> int:
        """Convert to the on-chain u8 representation."""
        return {"Yes": 0, "No": 1, "Invalid": 2}[self.value]


class MarketStatus(str, Enum):
    OPEN = "Open"
    LOCKED = "Locked"
    RESOLVED = "Resolved"
    SETTLED = "Settled"


class MarketInfo(BaseModel):
    """On-chain market data."""
    id: int
    title: str
    description: str
    resolution_deadline: int
    yes_pool: int
    no_pool: int
    status: MarketStatus
    outcome: Outcome | None = None
    oracle_confidence: int = 0


class JudgmentResult(BaseModel):
    """Result from a single AI provider's judgment."""
    provider: str
    outcome: Outcome
    confidence: int = Field(ge=0, le=100)
    reasoning: str


class ConsensusResult(BaseModel):
    """Aggregated consensus from multiple AI judgments."""
    judgments: list[JudgmentResult]
    final_outcome: Outcome
    final_confidence: int = Field(ge=0, le=100)
    consensus_reached: bool
    agreeing_providers: list[str]
    summary: str


class SourceSummary(BaseModel):
    """Summary of a fetched source URL."""
    url: str
    content: str
    error: str | None = None


class SearchResult(BaseModel):
    """A single web search result snippet."""
    title: str
    url: str
    snippet: str


class ResearchContext(BaseModel):
    """Aggregated research context from URLs and web searches."""
    source_summaries: list[SourceSummary] = []
    search_results: list[SearchResult] = []

    def to_prompt_section(self) -> str:
        """Format research context as a prompt section."""
        parts: list[str] = []
        if self.source_summaries:
            parts.append("### Fetched Sources")
            for s in self.source_summaries:
                if s.error:
                    parts.append(f"- {s.url}: [Error: {s.error}]")
                else:
                    parts.append(f"**{s.url}**\n{s.content}\n")
        if self.search_results:
            parts.append("### Web Search Results")
            for r in self.search_results:
                parts.append(f"- **{r.title}** ({r.url})\n  {r.snippet}")
        return "\n".join(parts) if parts else "No research context available."


class ResolveReport(BaseModel):
    """Full report of a market resolution."""
    market_id: int
    market_title: str
    consensus: ConsensusResult
    tx_signature: str | None = None
    error: str | None = None
