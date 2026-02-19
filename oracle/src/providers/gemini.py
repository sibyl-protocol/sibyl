"""Google Gemini 3 Pro provider for market judgment."""

import logging
import os

from google import genai
from google.genai import types

from ..types import JudgmentResult, Outcome, ResearchContext
from ..utils import parse_llm_json

logger = logging.getLogger(__name__)

PROVIDER_NAME = "gemini-3-pro"

JUDGMENT_PROMPT = """\
You are a prediction market oracle. Your job is to determine whether a prediction market should resolve as Yes, No, or Invalid.

## Market
Title: {title}
Description: {description}

## Evidence
{evidence}

## Instructions
1. Analyze the following context and evidence to determine whether the event described has occurred.
2. Consider the description carefully for resolution criteria.
3. Return your judgment as JSON with exactly these fields:
   - "outcome": one of "Yes", "No", or "Invalid"
   - "confidence": integer 0-100 representing your confidence
   - "reasoning": brief explanation of your judgment

Only return Invalid if the question is unanswerable, ambiguous beyond resolution, or the event cannot be verified.

Respond with ONLY valid JSON, no markdown fences or extra text.
"""


async def judge(
    market_title: str,
    market_description: str,
    research: ResearchContext,
) -> JudgmentResult:
    """Query Gemini 3 Pro for a market judgment."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is required")

    client = genai.Client(api_key=api_key)

    prompt = JUDGMENT_PROMPT.format(
        title=market_title,
        description=market_description,
        evidence=research.to_prompt_section(),
    )

    logger.info("Querying %s...", PROVIDER_NAME)

    response = await client.aio.models.generate_content(
        model="gemini-3-pro",
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=1024,
        ),
    )

    raw = response.text.strip()
    logger.debug("Raw response from %s: %s", PROVIDER_NAME, raw)

    data = parse_llm_json(raw)

    return JudgmentResult(
        provider=PROVIDER_NAME,
        outcome=Outcome(data["outcome"]),
        confidence=int(data["confidence"]),
        reasoning=str(data["reasoning"]),
    )
