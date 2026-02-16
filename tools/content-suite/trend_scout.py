"""
trend_scout.py — Research agent that discovers high-signal AI Automation topics.

Uses Brave Search API as primary source with Grok (xAI) as fallback.
Outputs trends.json for downstream pipeline consumption.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests

from factory_utils import (
    TRENDS_FILE,
    atomic_write_json,
    get_logger,
    load_config,
    with_retry,
)

log = get_logger("trend_scout")

# ---------------------------------------------------------------------------
# Search queries — enterprise decomposition pattern
# ---------------------------------------------------------------------------

QUERIES = [
    {
        "q": "AI agent pain points challenges reddit",
        "category": "pain_point",
    },
    {
        "q": "trending AI automation agents github repos 2025 2026",
        "category": "trending_repo",
    },
    {
        "q": "AI development tools automation problems discussions",
        "category": "discussion",
    },
    {
        "q": "AI agents framework comparison new releases 2025 2026",
        "category": "framework",
    },
]

# ---------------------------------------------------------------------------
# Brave Search
# ---------------------------------------------------------------------------

BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search"
BRAVE_HEADERS_BASE = {
    "Accept": "application/json",
    "Accept-Encoding": "gzip",
}


def _brave_search(api_key: str, query: str, count: int = 10) -> list[dict]:
    """Execute a single Brave Search API query and return raw results."""
    headers = {**BRAVE_HEADERS_BASE, "X-Subscription-Token": api_key}
    params = {"q": query, "count": count, "freshness": "pm"}

    log.debug("Brave search: q=%r count=%d", query, count)
    resp = requests.get(BRAVE_ENDPOINT, headers=headers, params=params, timeout=15)
    resp.raise_for_status()

    data = resp.json()
    results = data.get("web", {}).get("results", [])
    log.info("Brave search: q=%r -> %d results", query, len(results))
    return results


def brave_search_all(api_key: str) -> list[dict]:
    """Run all search queries against Brave and return merged trend items."""
    trends: list[dict] = []

    for entry in QUERIES:
        query = entry["q"]
        category = entry["category"]
        try:
            results = _brave_search(api_key, query)
        except Exception as exc:
            log.warning("Brave query failed: q=%r error=%s", query, exc)
            continue

        for r in results:
            title = r.get("title", "").strip()
            url = r.get("url", "").strip()
            description = r.get("description", "").strip()

            if not title or not url:
                continue

            source = _infer_source(url)
            why = _build_why_it_matters(description, category)

            trends.append({
                "title": title,
                "url": url,
                "source": source,
                "why_it_matters": why,
                "category": category,
            })

    return trends


# ---------------------------------------------------------------------------
# Grok (xAI) fallback
# ---------------------------------------------------------------------------

GROK_ENDPOINT = "https://api.x.ai/v1/chat/completions"


def grok_fallback(api_key: str) -> list[dict]:
    """Use Grok to generate trending AI automation topics as fallback."""
    log.info("Falling back to Grok API for trend discovery")

    prompt = (
        "List the top 10 trending AI automation topics from the last 30 days. "
        "For each, provide the topic title, a relevant URL, the source type "
        "(reddit, github, x, or blog), a category (pain_point, trending_repo, "
        "discussion, or framework), and a 2-3 sentence explanation of why it matters. "
        "Return ONLY a JSON array with objects having keys: title, url, source, "
        "why_it_matters, category. No markdown fences."
    )

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    body = {
        "model": "grok-3-mini",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "max_tokens": 2000,
    }

    resp = requests.post(GROK_ENDPOINT, headers=headers, json=body, timeout=30)
    resp.raise_for_status()

    data = resp.json()
    content = data["choices"][0]["message"]["content"].strip()
    log.debug("Grok raw response length: %d chars", len(content))

    # Strip markdown fences if present
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
    if content.endswith("```"):
        content = content[: content.rfind("```")]

    try:
        topics = json.loads(content.strip())
    except json.JSONDecodeError as exc:
        log.error("Failed to parse Grok response as JSON: %s", exc)
        return []

    if not isinstance(topics, list):
        log.error("Grok response is not a list, got %s", type(topics).__name__)
        return []

    trends: list[dict] = []
    for item in topics:
        if not isinstance(item, dict):
            continue
        trends.append({
            "title": str(item.get("title", "")).strip(),
            "url": str(item.get("url", "")).strip(),
            "source": str(item.get("source", "blog")).strip(),
            "why_it_matters": str(item.get("why_it_matters", "")).strip(),
            "category": str(item.get("category", "discussion")).strip(),
        })

    log.info("Grok fallback produced %d trends", len(trends))
    return trends


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _infer_source(url: str) -> str:
    """Infer source type from URL domain."""
    domain = urlparse(url).netloc.lower()
    if "reddit.com" in domain:
        return "reddit"
    if "github.com" in domain:
        return "github"
    if "x.com" in domain or "twitter.com" in domain:
        return "x"
    return "blog"


def _build_why_it_matters(description: str, category: str) -> str:
    """Construct a why_it_matters summary from description and category context."""
    category_context = {
        "pain_point": "This highlights a common challenge developers face with AI automation.",
        "trending_repo": "This repository is gaining traction in the AI automation community.",
        "discussion": "This discussion reflects growing interest in AI automation tooling.",
        "framework": "This framework update is shaping the AI agent development landscape.",
    }
    context = category_context.get(category, "")
    if description:
        return f"{description} {context}"
    return context


def _deduplicate(trends: list[dict]) -> list[dict]:
    """Remove duplicate trends by URL."""
    seen: set[str] = set()
    unique: list[dict] = []
    for t in trends:
        url = t.get("url", "")
        if url and url not in seen:
            seen.add(url)
            unique.append(t)
    return unique


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def _async_search(config: dict) -> tuple[list[dict], str]:
    """Run search with retry, trying Brave first then Grok fallback."""
    brave_key = config.get("BRAVE_API_KEY")
    grok_key = config.get("GROK_API_KEY")

    # Try Brave Search first
    if brave_key:
        try:
            trends = await with_retry(lambda: brave_search_all(brave_key))
            if trends:
                log.info("Brave Search returned %d total results", len(trends))
                return trends, "brave"
            log.warning("Brave Search returned 0 results, trying fallback")
        except Exception as exc:
            log.warning("Brave Search failed after retries: %s", exc)
    else:
        log.warning("BRAVE_API_KEY not set, skipping Brave Search")

    # Fallback to Grok
    if grok_key:
        try:
            trends = await with_retry(lambda: grok_fallback(grok_key))
            if trends:
                log.info("Grok fallback returned %d results", len(trends))
                return trends, "grok"
            log.warning("Grok fallback returned 0 results")
        except Exception as exc:
            log.error("Grok fallback failed after retries: %s", exc)
    else:
        log.warning("GROK_API_KEY not set, skipping Grok fallback")

    return [], "none"


def main() -> None:
    """Discover trending AI automation topics and write trends.json."""
    log.info("=== trend_scout starting ===")

    config = load_config()
    trends, provider = asyncio.run(_async_search(config))

    if not trends:
        log.error("No trends discovered from any provider — trends.json not updated")
        return

    trends = _deduplicate(trends)
    log.info("After deduplication: %d unique trends", len(trends))

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "query_date_range": "last_30_days",
        "search_provider": provider,
        "trends": trends,
    }

    atomic_write_json(TRENDS_FILE, output)
    log.info("Wrote %d trends to %s (provider=%s)", len(trends), TRENDS_FILE, provider)
    log.info("=== trend_scout complete ===")


if __name__ == "__main__":
    main()
