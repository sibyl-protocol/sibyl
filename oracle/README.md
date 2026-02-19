# Sibyl Oracle Service

AI-powered oracle for the Sibyl prediction market. Uses 3 independent LLMs (Gemini 3 Pro, Claude Opus 4.5, GPT-5.2) to reach consensus on market outcomes, then submits the resolution on-chain.

## How It Works

1. **Fetch** market data (title, description) from Solana
2. **Research** — fetch source URLs and run web searches for real-time context
3. **Judge** — query all 3 AI models simultaneously with evidence-enriched prompts
4. **Consensus** — 2/3 agreement required; confidence = average of agreeing models
5. **Resolve** — submit the outcome on-chain via the `resolve` instruction

## Setup

```bash
# Install dependencies
uv pip install -e .

# Configure environment
cp .env.example .env
# Edit .env with your API keys and keypair path
```

## Usage

```bash
# Resolve a market
python -m oracle.src.main --market-id 0

# Dry run (judgment only, no on-chain tx)
python -m oracle.src.main --market-id 0 --dry-run

# Verbose logging
python -m oracle.src.main --market-id 0 -v
```

## Architecture

```
oracle/
├── markets.json      Market-specific sources and search queries config
└── src/
    ├── main.py        CLI entry point — orchestrates the full pipeline
    ├── judge.py       3-model consensus logic (asyncio)
    ├── researcher.py  Real-time context fetcher (URLs + Brave Search)
    ├── chain.py       Solana RPC + transaction submission
    ├── types.py       Pydantic models (JudgmentResult, ResearchContext, etc.)
    ├── utils.py       Shared utilities (robust JSON parsing, etc.)
    └── providers/
        ├── gemini.py   Google Gemini 3 Pro
        ├── claude.py   Anthropic Claude Opus 4.5
        └── openai.py   OpenAI GPT-5.2
```

## Research Component

Before querying AI providers, the oracle gathers real-time evidence:

- **Source fetching**: Downloads configured URLs, extracts readable text via BeautifulSoup
- **Web search**: Queries Brave Search API for recent information
- Content is truncated to 2000 chars per source, max 5 search results
- Errors are handled gracefully (failed URLs/searches are skipped)

The gathered evidence is injected into each provider's prompt under an "Evidence" section.

## Market Configuration

`markets.json` maps market IDs to resolution sources and search queries:

```json
{
  "0": {
    "sources": ["https://example.com/bill-status"],
    "search_queries": ["bill status 2026"]
  }
}
```

If no config exists for a market, the market title is used as a fallback search query.

## Consensus Rules

| Scenario | Outcome |
|---|---|
| 2 or 3 models agree | Majority outcome wins |
| All 3 disagree | Invalid |
| <2 models respond (errors/timeouts) | Invalid |

Final confidence = average confidence of the agreeing models.

## Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google AI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `BRAVE_API_KEY` | Brave Search API key (for research) |
| `ORACLE_KEYPAIR_PATH` | Path to Solana keypair JSON file |
| `SOLANA_RPC_URL` | Solana RPC endpoint (default: devnet) |
