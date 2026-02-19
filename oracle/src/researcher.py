"""Real-time research context fetcher for the Sibyl Oracle.

Fetches source URLs and runs web searches to gather evidence
before AI providers make their judgments.
"""

import logging
import os

import httpx
from bs4 import BeautifulSoup

from .types import ResearchContext, SearchResult, SourceSummary

logger = logging.getLogger(__name__)

MAX_CONTENT_LENGTH = 2000
MAX_SEARCH_RESULTS = 5
FETCH_TIMEOUT = 15.0


async def fetch_url(client: httpx.AsyncClient, url: str) -> SourceSummary:
    """Fetch a URL and extract readable text content."""
    try:
        resp = await client.get(url, follow_redirects=True, timeout=FETCH_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove script/style elements
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)
        # Truncate
        if len(text) > MAX_CONTENT_LENGTH:
            text = text[:MAX_CONTENT_LENGTH] + "..."

        return SourceSummary(url=url, content=text)
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
        return SourceSummary(url=url, content="", error=str(e))


async def brave_search(client: httpx.AsyncClient, query: str) -> list[SearchResult]:
    """Run a web search via Brave Search API."""
    api_key = os.environ.get("BRAVE_API_KEY")
    if not api_key:
        logger.warning("BRAVE_API_KEY not set, skipping web search")
        return []

    try:
        resp = await client.get(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": query, "count": MAX_SEARCH_RESULTS},
            headers={"X-Subscription-Token": api_key, "Accept": "application/json"},
            timeout=FETCH_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()

        results = []
        for item in data.get("web", {}).get("results", [])[:MAX_SEARCH_RESULTS]:
            results.append(SearchResult(
                title=item.get("title", ""),
                url=item.get("url", ""),
                snippet=item.get("description", ""),
            ))
        return results
    except Exception as e:
        logger.warning("Brave search failed for '%s': %s", query, e)
        return []


async def gather_research(
    sources: list[str],
    search_queries: list[str],
) -> ResearchContext:
    """Fetch all sources and run all search queries, returning aggregated context."""
    context = ResearchContext()

    async with httpx.AsyncClient() as client:
        # Fetch source URLs
        for url in sources:
            summary = await fetch_url(client, url)
            context.source_summaries.append(summary)

        # Run searches
        for query in search_queries:
            results = await brave_search(client, query)
            context.search_results.extend(results)

    # Cap total search results
    context.search_results = context.search_results[:MAX_SEARCH_RESULTS]

    return context
