"""Shared utilities for the Sibyl Oracle service."""

import json
import re


def parse_llm_json(raw: str) -> dict:
    """Parse JSON from LLM responses, handling markdown fences and extra text.

    Strips markdown code fences (```json...``` or ```...```), extracts the
    JSON object between the first '{' and last '}', then parses it.

    Raises ValueError with the raw text if parsing fails.
    """
    text = raw.strip()

    # Strip markdown code fences
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)

    # Extract from first { to last }
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError(f"No JSON object found in LLM response: {raw}")

    text = text[start : end + 1]

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse JSON from LLM response: {raw}") from e
