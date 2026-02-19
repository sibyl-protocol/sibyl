"""OpenAI GPT-5.2 provider for market judgment."""

import logging
import os

import openai

from ..types import JudgmentResult, Outcome, ResearchContext
from ..utils import parse_llm_json

logger = logging.getLogger(__name__)

PROVIDER_NAME = "gpt-5.2"

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
    """Query GPT-5.2 for a market judgment."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is required")

    base_url = os.environ.get("OPENAI_BASE_URL")
    client = openai.AsyncOpenAI(api_key=api_key, **({"base_url": base_url} if base_url else {}))

    prompt = JUDGMENT_PROMPT.format(
        title=market_title,
        description=market_description,
        evidence=research.to_prompt_section(),
    )

    logger.info("Querying %s...", PROVIDER_NAME)

    response = await client.chat.completions.create(
        model=os.environ.get("OPENAI_MODEL", "gpt-5.2"),
        temperature=0.1,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": "You are a prediction market oracle. Respond only with valid JSON."},
            {"role": "user", "content": prompt},
        ],
    )

    raw = response.choices[0].message.content.strip()
    logger.debug("Raw response from %s: %s", PROVIDER_NAME, raw)

    data = parse_llm_json(raw)

    return JudgmentResult(
        provider=PROVIDER_NAME,
        outcome=Outcome(data["outcome"]),
        confidence=int(data["confidence"]),
        reasoning=str(data["reasoning"]),
    )
