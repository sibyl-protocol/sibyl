"""Tests for src.providers — mocked LLM API calls."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from src.types import Outcome, ResearchContext


VALID_JSON_RESPONSE = '{"outcome": "Yes", "confidence": 85, "reasoning": "Evidence supports yes"}'


# --- Claude ---

@pytest.mark.asyncio
async def test_claude_returns_valid_judgment(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    mock_message = MagicMock()
    mock_message.content = [MagicMock(text=VALID_JSON_RESPONSE)]

    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(return_value=mock_message)

    with patch("src.providers.claude.anthropic.AsyncAnthropic", return_value=mock_client):
        from src.providers.claude import judge
        result = await judge("Test Market", "Description", ResearchContext())

    assert result.provider == "claude-opus-4-5"
    assert result.outcome == Outcome.YES
    assert result.confidence == 85


@pytest.mark.asyncio
async def test_claude_missing_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    from src.providers.claude import judge
    with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
        await judge("Test", "Desc", ResearchContext())


# --- OpenAI ---

@pytest.mark.asyncio
async def test_openai_returns_valid_judgment(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    mock_choice = MagicMock()
    mock_choice.message.content = VALID_JSON_RESPONSE
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("src.providers.openai.openai.AsyncOpenAI", return_value=mock_client):
        from src.providers.openai import judge
        result = await judge("Test Market", "Description", ResearchContext())

    assert result.provider == "gpt-5.2"
    assert result.outcome == Outcome.YES
    assert result.confidence == 85


@pytest.mark.asyncio
async def test_openai_missing_api_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from src.providers.openai import judge
    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        await judge("Test", "Desc", ResearchContext())


# --- Gemini ---

@pytest.mark.asyncio
async def test_gemini_returns_valid_judgment(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    mock_response = MagicMock()
    mock_response.text = VALID_JSON_RESPONSE

    mock_aio = MagicMock()
    mock_aio.models.generate_content = AsyncMock(return_value=mock_response)

    mock_client = MagicMock()
    mock_client.aio = mock_aio

    with patch("src.providers.gemini.genai.Client", return_value=mock_client):
        from src.providers.gemini import judge
        result = await judge("Test Market", "Description", ResearchContext())

    assert result.provider == "gemini-3-pro"
    assert result.outcome == Outcome.YES
    assert result.confidence == 85


@pytest.mark.asyncio
async def test_gemini_missing_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    from src.providers.gemini import judge
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        await judge("Test", "Desc", ResearchContext())


# --- Prompt content verification ---

@pytest.mark.asyncio
async def test_claude_prompt_includes_market_info(monkeypatch):
    """Verify the prompt sent to Claude includes market title and description."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    mock_message = MagicMock()
    mock_message.content = [MagicMock(text=VALID_JSON_RESPONSE)]

    mock_client = AsyncMock()
    mock_client.messages.create = AsyncMock(return_value=mock_message)

    with patch("src.providers.claude.anthropic.AsyncAnthropic", return_value=mock_client):
        from src.providers.claude import judge
        await judge("My Special Market", "Detailed description here", ResearchContext())

    # Check the prompt passed to the API
    call_kwargs = mock_client.messages.create.call_args.kwargs
    prompt_text = call_kwargs["messages"][0]["content"]
    assert "My Special Market" in prompt_text
    assert "Detailed description here" in prompt_text
