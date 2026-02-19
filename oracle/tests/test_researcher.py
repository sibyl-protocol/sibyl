"""Tests for src.researcher — URL fetching and Brave search."""

import pytest
import httpx
import respx

from src.researcher import fetch_url, brave_search, gather_research, MAX_CONTENT_LENGTH


@pytest.mark.asyncio
async def test_fetch_url_success():
    """Successful URL fetch returns truncated content."""
    html = "<html><body><p>Hello world</p></body></html>"
    with respx.mock:
        respx.get("https://example.com/page").mock(
            return_value=httpx.Response(200, text=html)
        )
        async with httpx.AsyncClient() as client:
            result = await fetch_url(client, "https://example.com/page")
    assert result.url == "https://example.com/page"
    assert "Hello world" in result.content
    assert result.error is None


@pytest.mark.asyncio
async def test_fetch_url_truncation():
    """Content exceeding MAX_CONTENT_LENGTH is truncated."""
    long_text = "A" * (MAX_CONTENT_LENGTH + 500)
    html = f"<html><body><p>{long_text}</p></body></html>"
    with respx.mock:
        respx.get("https://example.com/long").mock(
            return_value=httpx.Response(200, text=html)
        )
        async with httpx.AsyncClient() as client:
            result = await fetch_url(client, "https://example.com/long")
    assert len(result.content) == MAX_CONTENT_LENGTH + 3  # +3 for "..."
    assert result.content.endswith("...")


@pytest.mark.asyncio
async def test_fetch_url_failure():
    """URL fetch failure returns empty content with error."""
    with respx.mock:
        respx.get("https://example.com/bad").mock(
            return_value=httpx.Response(500, text="Server Error")
        )
        async with httpx.AsyncClient() as client:
            result = await fetch_url(client, "https://example.com/bad")
    assert result.content == ""
    assert result.error is not None


@pytest.mark.asyncio
async def test_brave_search_success(monkeypatch):
    """Brave Search returns parsed results."""
    monkeypatch.setenv("BRAVE_API_KEY", "test-key")
    mock_response = {
        "web": {
            "results": [
                {"title": "Result 1", "url": "https://r1.com", "description": "Snippet 1"},
                {"title": "Result 2", "url": "https://r2.com", "description": "Snippet 2"},
            ]
        }
    }
    with respx.mock:
        respx.get("https://api.search.brave.com/res/v1/web/search").mock(
            return_value=httpx.Response(200, json=mock_response)
        )
        async with httpx.AsyncClient() as client:
            results = await brave_search(client, "test query")
    assert len(results) == 2
    assert results[0].title == "Result 1"
    assert results[1].snippet == "Snippet 2"


@pytest.mark.asyncio
async def test_brave_search_no_api_key(monkeypatch):
    """Without BRAVE_API_KEY, returns empty list."""
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)
    async with httpx.AsyncClient() as client:
        results = await brave_search(client, "test query")
    assert results == []


@pytest.mark.asyncio
async def test_gather_research_combines(monkeypatch):
    """gather_research aggregates sources and search results."""
    monkeypatch.setenv("BRAVE_API_KEY", "test-key")
    html = "<html><body><p>Source content</p></body></html>"
    search_resp = {
        "web": {
            "results": [
                {"title": "SR", "url": "https://sr.com", "description": "A search result"},
            ]
        }
    }
    with respx.mock:
        respx.get("https://example.com/src").mock(
            return_value=httpx.Response(200, text=html)
        )
        respx.get("https://api.search.brave.com/res/v1/web/search").mock(
            return_value=httpx.Response(200, json=search_resp)
        )
        ctx = await gather_research(
            sources=["https://example.com/src"],
            search_queries=["test"],
        )
    assert len(ctx.source_summaries) == 1
    assert "Source content" in ctx.source_summaries[0].content
    assert len(ctx.search_results) == 1
    assert ctx.search_results[0].title == "SR"
