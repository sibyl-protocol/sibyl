"""Tests for src.utils — JSON parsing from LLM responses."""

import pytest
from src.utils import parse_llm_json


class TestParseLlmJson:
    def test_valid_json(self):
        raw = '{"outcome": "Yes", "confidence": 85, "reasoning": "clear"}'
        result = parse_llm_json(raw)
        assert result == {"outcome": "Yes", "confidence": 85, "reasoning": "clear"}

    def test_json_with_markdown_fences(self):
        raw = '```json\n{"outcome": "No", "confidence": 70, "reasoning": "nope"}\n```'
        result = parse_llm_json(raw)
        assert result["outcome"] == "No"
        assert result["confidence"] == 70

    def test_json_with_plain_fences(self):
        raw = '```\n{"outcome": "Yes", "confidence": 90, "reasoning": "yes"}\n```'
        result = parse_llm_json(raw)
        assert result["outcome"] == "Yes"

    def test_json_with_extra_text(self):
        raw = 'Here is my analysis:\n{"outcome": "Yes", "confidence": 80, "reasoning": "looks good"}\nThat is my answer.'
        result = parse_llm_json(raw)
        assert result["outcome"] == "Yes"
        assert result["confidence"] == 80

    def test_no_json_raises_value_error(self):
        with pytest.raises(ValueError, match="No JSON object found"):
            parse_llm_json("This response has no JSON at all")

    def test_malformed_json_raises_value_error(self):
        with pytest.raises(ValueError, match="Failed to parse JSON"):
            parse_llm_json('{"outcome": "Yes", confidence: }')

    def test_empty_string_raises_value_error(self):
        with pytest.raises(ValueError):
            parse_llm_json("")

    def test_nested_json(self):
        raw = '{"outcome": "Yes", "confidence": 90, "reasoning": "test", "meta": {"src": "web"}}'
        result = parse_llm_json(raw)
        assert result["meta"]["src"] == "web"
