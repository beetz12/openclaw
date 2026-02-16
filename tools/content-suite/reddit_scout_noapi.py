#!/usr/bin/env python3
"""No-API Reddit scraper using public JSON endpoints.

Fetches posts and comments from Reddit without API credentials.
Uses www.reddit.com/*.json endpoints with retry, backoff, and
cursor-based pagination.

Usage (imported by reddit_scout.py):
    from reddit_scout_noapi import fetch_posts_noapi
    posts = fetch_posts_noapi("OpenClaw", subreddit="LocalLLaMA", mode="pain")
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

from factory_utils import get_logger
from reddit_scout import DEFAULT_COMMENT_LIMIT, mode_to_search

log = get_logger("reddit_scout_noapi")

_BASE_URL = "https://www.reddit.com"
_USER_AGENT = "RedditScout/1.0 (research bot)"
_DEFAULT_DELAY = 3.0
_MAX_PER_PAGE = 100

# Hard timeout for the entire fetch_posts_noapi pipeline (D8)
_PIPELINE_TIMEOUT_S = 360

# LLM call timeout in seconds (D12)
# claude_agent_sdk spawns a CLI subprocess with ~15-20s startup overhead,
# so 60s gives enough headroom for startup + LLM response.
_LLM_TIMEOUT_S = 60


# ---------------------------------------------------------------------------
# Data structures (checklist #1)
# ---------------------------------------------------------------------------

@dataclass
class QueryPlan:
    """Output of LLM query decomposition.

    Attributes:
        intent:         One-line description of what the user wants.
        subreddits:     Ordered list of subreddit names to search.
        sub_queries:    Mapping of subreddit name -> list of search query strings.
        global_queries: Fallback queries for searching r/all.
        mode:           The research mode hint ("pain", "market", "general").
        source:         "llm", "fallback", or "user_specified".
    """
    intent: str
    subreddits: list[str]
    sub_queries: dict[str, list[str]]
    global_queries: list[str]
    mode: str
    source: str = "llm"

    def queries_for_sub(self, sub_name: str) -> list[str]:
        """Return the list of queries to run in a given subreddit.

        For LLM plans, returns per-sub queries.
        For fallback plans, returns global_queries (uniform for all subs).
        """
        if sub_name in self.sub_queries and self.sub_queries[sub_name]:
            return self.sub_queries[sub_name]
        return self.global_queries


# ---------------------------------------------------------------------------
# LLM prompt and mode descriptions (checklist #2, #3)
# ---------------------------------------------------------------------------

_MODE_DESCRIPTIONS = {
    "pain": (
        "Find pain points, frustrations, complaints, and unmet needs. "
        "The user wants to discover what problems people are having, what's broken, "
        "what makes them angry or frustrated. Target emotional, venting, help-seeking posts."
    ),
    "market": (
        "Find buying intent, product comparisons, pricing discussions, and switching triggers. "
        "The user wants to discover what people are buying, what they're comparing, "
        "what alternatives they're evaluating, and what makes them switch products."
    ),
    "general": (
        "Find general discussion, trends, opinions, and insights about this topic. "
        "The user wants a broad understanding of how this topic is discussed on Reddit. "
        "Target popular threads with high engagement."
    ),
}

_QUERY_PLAN_PROMPT = """\
You are an expert Reddit researcher. Given a user's research query and research \
mode, produce a comprehensive search plan.

## User Query
"{query}"

## Research Mode
"{mode}" -- {mode_description}

## Your Task

Produce a JSON search plan with:

1. **subreddits**: 15-25 real Reddit subreddit names where this topic is discussed.
   - Include direct topic subs, platform/marketplace subs, advice subs, and niche \
specialist subs.
   - Think about what communities would organically discuss this topic even if they \
never use the exact words from the query.

2. **sub_queries**: For EACH subreddit, generate 2-3 Reddit search queries that \
will find relevant posts IN THAT SPECIFIC COMMUNITY.
   - Use the vocabulary and jargon that members of that subreddit actually use.
   - Preserve multi-word concepts as quoted phrases (e.g., "lead generation", not \
lead generation).
   - Use simple OR-only queries with 2-4 terms. Do NOT use AND or nested parentheses.
   - DO NOT include the subreddit's own topic as a keyword (e.g., don't search for \
"etsy" in r/EtsySellers -- they already know they're on Etsy).
   - Each query should be SHORT (under 60 characters) -- Reddit search works best \
with 2-5 terms.
   - Order queries from broadest (most likely to return results) to most specific \
(highest precision).

3. **global_queries**: 2-3 queries for searching across all of Reddit (r/all), \
using the original topic vocabulary. These serve as a fallback.

4. **intent**: A one-line description of what the user is really looking for.

## Critical Rules for sub_queries

- In r/EtsySellers, people say "shop", "listing", "views", "sales" -- NOT \
"ecommerce", "product page", "online store".
- In r/shopify, people say "store", "product", "theme", "app" -- NOT "ecommerce \
platform", "website".
- In r/FulfillmentByAmazon, people say "listing", "ASIN", "PPC", "BSR" -- NOT \
"Amazon product", "ecommerce".
- In r/Entrepreneur, people say "business", "startup", "revenue" -- NOT "commercial \
enterprise".
- ALWAYS think: "What words would someone in THIS subreddit actually type?"
- For pain/frustration queries: use emotional words that sub members use ("rant", \
"vent", "frustrated", "struggling", "help", "stuck", "broken", "nightmare").
- For market/comparison queries: use comparison language ("vs", "switched from", \
"alternative to", "better than", "moved to").

## Output Format

Return ONLY valid JSON matching this exact structure:

```json
{{
  "intent": "string describing what the user wants to learn",
  "subreddits": ["SubName1", "SubName2", "...15-25 total"],
  "sub_queries": {{
    "SubName1": ["query one for this sub", "query two for this sub"],
    "SubName2": ["query one for this sub", "query two for this sub"]
  }},
  "global_queries": ["global query 1", "global query 2"]
}}
```\
"""


# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------

def _build_session() -> requests.Session:
    """Create a requests.Session with retry adapter and custom User-Agent."""
    session = requests.Session()
    retry = Retry(
        total=5,
        backoff_factor=2,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": _USER_AGENT})
    return session


def _get_delay() -> float:
    """Return the inter-request delay from env or default."""
    try:
        return float(os.getenv("REDDIT_REQUEST_DELAY", str(_DEFAULT_DELAY)))
    except (ValueError, TypeError):
        return _DEFAULT_DELAY


def _sleep() -> None:
    """Sleep for the configured delay with a small random jitter."""
    base = _get_delay()
    time.sleep(base + random.uniform(0, 0.5))


# ---------------------------------------------------------------------------
# Low-level fetch (checklist #10 — 429 backoff)
# ---------------------------------------------------------------------------

_429_BACKOFF_DELAYS = [5, 10, 20]


def _fetch_json(session: requests.Session, url: str, params: dict[str, str] | None = None) -> Any:
    """GET a Reddit JSON endpoint. Returns parsed JSON or None on failure.

    Implements exponential backoff on HTTP 429 (D2): retries with 5s, 10s, 20s
    delays. After 3 failures, returns None and logs a warning.
    """
    for attempt in range(len(_429_BACKOFF_DELAYS) + 1):
        try:
            resp = session.get(url, params=params, timeout=30)

            # Handle 429 with manual backoff (D2)
            if resp.status_code == 429:
                if attempt < len(_429_BACKOFF_DELAYS):
                    delay = _429_BACKOFF_DELAYS[attempt]
                    log.warning(
                        "HTTP 429 from %s (attempt %d/%d), backing off %ds",
                        url, attempt + 1, len(_429_BACKOFF_DELAYS), delay,
                    )
                    time.sleep(delay)
                    continue
                else:
                    log.warning(
                        "HTTP 429 from %s after %d retries, skipping request",
                        url, len(_429_BACKOFF_DELAYS),
                    )
                    return None

            content_type = resp.headers.get("Content-Type", "")
            if "json" not in content_type and "javascript" not in content_type:
                log.warning("Non-JSON response from %s (Content-Type: %s)", url, content_type)
                return None
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            log.warning("Request failed for %s: %s", url, exc)
            return None
        except ValueError as exc:
            log.warning("JSON decode failed for %s: %s", url, exc)
            return None
    return None


# ---------------------------------------------------------------------------
# Query sanitization (checklist #6 — D1)
# ---------------------------------------------------------------------------

def _sanitize_query(query: str) -> str:
    """Strip unsupported boolean operators for Reddit search.

    Reddit search is unreliable with complex boolean. Simplify to
    OR-only queries with optional quoted phrases (D1).
    """
    # Remove explicit AND (Reddit uses implicit AND for space-separated terms)
    query = re.sub(r'\bAND\b', '', query)
    # Remove parentheses (keep flat grouping)
    query = re.sub(r'[()]', '', query)
    # Collapse whitespace
    return re.sub(r'\s+', ' ', query).strip()


# ---------------------------------------------------------------------------
# LLM-powered subreddit expansion (DEPRECATED — kept for backward compat)
# ---------------------------------------------------------------------------

_EXPANSION_PROMPT = """You are a Reddit expert. Given the search query "{query}", generate a comprehensive list of REAL Reddit subreddit names (without the r/ prefix) where relevant discussions would likely occur.

Think broadly across these categories:
1. **Direct topic subreddits** — communities explicitly about the topic
2. **Subcategory / breed / variant subreddits** — e.g., for "dog" queries include EVERY common breed (goldenretrievers, husky, labrador, germanshepherds, poodles, beagles, bulldogs, etc.); for "car" queries include specific makes/models
3. **Platform / marketplace subreddits** — e.g., for "ecommerce" include Etsy, eBay, FulfillmentByAmazon, shopify, Faire, AmazonSeller, etc.
4. **Advice / help communities** — where people ask for help on this topic (puppy101, DogAdvice, etc.)
5. **Niche / specialist communities** — smaller but highly relevant subs
6. **Adjacent interest communities** — communities whose members frequently discuss this topic

Return ONLY a valid JSON array of subreddit names. Include 20-30 suggestions.
Example: ["dogs", "goldenretrievers", "husky", "puppy101", "DogAdvice", "dogtoys"]"""


async def _llm_expand_subreddits(query: str) -> list[str]:
    """Use Claude to generate a broad list of related subreddit names.

    .. deprecated::
        Superseded by ``_llm_build_query_plan()`` which combines subreddit
        discovery and query decomposition in a single LLM call. Kept for
        backward compatibility with external callers.

    Returns an empty list if Claude CLI is unavailable or the call fails.
    Controlled by env var ``REDDIT_LLM_EXPANSION`` (default ``true``).
    """
    if os.getenv("REDDIT_LLM_EXPANSION", "true").lower() in ("false", "0", "no"):
        log.info("LLM subreddit expansion disabled via REDDIT_LLM_EXPANSION=false")
        return []

    try:
        from claude_agent_sdk import AssistantMessage, ClaudeAgentOptions, TextBlock, query as claude_query
    except ImportError:
        log.warning("claude_agent_sdk not available; skipping LLM expansion.")
        return []

    # Remove CLAUDECODE guard so SDK can spawn a CLI subprocess
    os.environ.pop("CLAUDECODE", None)

    prompt = _EXPANSION_PROMPT.format(query=query)
    options = ClaudeAgentOptions(
        cwd=str(Path.cwd()),
        permission_mode="bypassPermissions",
        max_turns=1,
    )

    text_chunks: list[str] = []
    try:
        async for message in claude_query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        text_chunks.append(block.text)
    except Exception as exc:
        log.warning("LLM expansion failed: %s", exc)
        return []

    raw_text = "\n".join(text_chunks).strip()
    if not raw_text:
        return []

    # Parse JSON array from response — try multiple extraction strategies
    # Strategy 1: Find the JSON array directly with regex
    array_match = re.search(r"\[[\s\S]*?\]", raw_text)
    if array_match:
        try:
            suggestions = json.loads(array_match.group())
            if isinstance(suggestions, list):
                result = [str(s).strip() for s in suggestions if isinstance(s, str) and s.strip()]
                log.info("LLM expansion suggested %d subreddits: %s", len(result), result)
                return result
        except (json.JSONDecodeError, TypeError):
            pass

    # Strategy 2: Strip markdown fences and try again
    cleaned = re.sub(r"```(?:json)?\s*", "", raw_text).strip().rstrip("`")
    try:
        suggestions = json.loads(cleaned)
        if isinstance(suggestions, list):
            result = [str(s).strip() for s in suggestions if isinstance(s, str) and s.strip()]
            log.info("LLM expansion suggested %d subreddits: %s", len(result), result)
            return result
    except (json.JSONDecodeError, TypeError):
        pass

    # Strategy 3: Extract quoted strings as a fallback
    quoted = re.findall(r'"([A-Za-z0-9_]+)"', raw_text)
    if quoted:
        log.info("LLM expansion (fallback parse) found %d subreddits: %s", len(quoted), quoted)
        return quoted

    log.warning("Failed to parse LLM expansion response from: %s", raw_text[:200])
    return []


def _validate_subreddits(
    session: requests.Session,
    names: list[str],
    max_checks: int = 30,
) -> dict[str, int]:
    """Check which subreddits actually exist and return {name: subscribers}.

    Limits to *max_checks* requests to avoid excessive API calls.
    """
    valid: dict[str, int] = {}
    for name in names[:max_checks]:
        url = f"{_BASE_URL}/r/{quote_plus(name)}/about.json"
        data = _fetch_json(session, url)
        if data and isinstance(data, dict) and data.get("kind") == "t5":
            d = data.get("data", {})
            display = d.get("display_name", name)
            subscribers = int(d.get("subscribers", 0) or 0)
            if not d.get("over18", False):
                valid[display] = subscribers
                log.debug("Validated r/%s (%d subscribers)", display, subscribers)
        _sleep()
    log.info("Validated %d / %d LLM-suggested subreddits.", len(valid), min(len(names), max_checks))
    return valid


# ---------------------------------------------------------------------------
# LLM-powered query plan builder (checklist #4, #5)
# ---------------------------------------------------------------------------

async def _llm_build_query_plan(query: str, mode: str) -> QueryPlan | None:
    """Ask the LLM to produce a QueryPlan for the given query and mode.

    Returns None if the LLM is unavailable or the response cannot be parsed.
    Uses claude_agent_sdk with a 60s timeout to account for CLI startup overhead.
    """
    if os.getenv("REDDIT_LLM_EXPANSION", "true").lower() in ("false", "0", "no"):
        log.info("LLM expansion disabled via env var")
        return None

    try:
        from claude_agent_sdk import (
            AssistantMessage, ClaudeAgentOptions, TextBlock,
            query as claude_query,
        )
    except ImportError:
        log.warning("claude_agent_sdk not available; skipping LLM query plan.")
        return None

    os.environ.pop("CLAUDECODE", None)

    mode_desc = _MODE_DESCRIPTIONS.get(mode, _MODE_DESCRIPTIONS["general"])
    prompt = _QUERY_PLAN_PROMPT.format(
        query=query,
        mode=mode,
        mode_description=mode_desc,
    )

    log.info("Building LLM query plan (timeout=%ds)", _LLM_TIMEOUT_S)
    options = ClaudeAgentOptions(
        cwd=str(Path.cwd()),
        permission_mode="bypassPermissions",
        max_turns=1,
    )

    text_chunks: list[str] = []

    async def _stream_llm() -> None:
        async for message in claude_query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        text_chunks.append(block.text)

    try:
        await asyncio.wait_for(_stream_llm(), timeout=_LLM_TIMEOUT_S)
    except asyncio.TimeoutError:
        log.warning("LLM query plan timed out after %ds", _LLM_TIMEOUT_S)
        return None
    except Exception as exc:
        log.warning("LLM query plan failed: %s", exc)
        return None

    raw_text = "\n".join(text_chunks).strip()
    return _parse_query_plan(raw_text, mode)


def _parse_query_plan(raw_text: str, mode: str) -> QueryPlan | None:
    """Parse the LLM's JSON response into a QueryPlan (checklist #5).

    Tries multiple extraction strategies (same pattern as existing code).
    Includes empty-field guards: if a sub has no queries, use global_queries.
    """
    if not raw_text:
        return None

    # Strategy 1: Find JSON object with regex
    obj_match = re.search(r"\{[\s\S]*\}", raw_text)
    parsed = None
    if obj_match:
        try:
            parsed = json.loads(obj_match.group())
        except json.JSONDecodeError:
            pass

    # Strategy 2: Strip markdown fences and retry
    if parsed is None:
        cleaned = re.sub(r"```(?:json)?\s*", "", raw_text).strip().rstrip("`")
        try:
            parsed = json.loads(cleaned)
        except (json.JSONDecodeError, TypeError):
            pass

    if not parsed or not isinstance(parsed, dict):
        log.warning("Failed to parse LLM query plan from: %s", raw_text[:300])
        return None

    # Validate required fields
    subreddits = parsed.get("subreddits", [])
    sub_queries = parsed.get("sub_queries", {})
    global_queries = parsed.get("global_queries", [])
    intent = parsed.get("intent", "")

    if not subreddits:
        log.warning("LLM query plan has no subreddits")
        return None

    # Empty-field guards: ensure every subreddit has at least a query
    for sub in subreddits:
        if sub not in sub_queries or not sub_queries[sub]:
            sub_queries[sub] = global_queries[:2] if global_queries else [intent]

    return QueryPlan(
        intent=intent,
        subreddits=subreddits,
        sub_queries=sub_queries,
        global_queries=global_queries or [intent],
        mode=mode,
        source="llm",
    )


# ---------------------------------------------------------------------------
# Fallback and user-specified plan builders (checklist #7, #8)
# ---------------------------------------------------------------------------

def _build_fallback_query_plan(topic: str, mode: str) -> QueryPlan:
    """Build a QueryPlan without the LLM, using keyword heuristics (checklist #7).

    This is the graceful degradation path. It replicates the current
    behavior but wraps it in the QueryPlan structure.
    """
    search_config = mode_to_search(topic, mode)
    global_queries = [search_config.query]

    sub_query = _build_sub_query(topic, mode)

    return QueryPlan(
        intent=topic,
        subreddits=[],  # will be filled by find_subreddits()
        sub_queries={},  # filled later: {sub: [sub_query]} for each discovered sub
        global_queries=global_queries,
        mode=mode,
        source="fallback",
    )


def _build_user_specified_plan(topic: str, mode: str, subreddit: str) -> QueryPlan:
    """Build a QueryPlan when the user specifies a subreddit explicitly (checklist #8).

    Uses the existing mode_to_search() for the primary query, plus
    the lighter _build_sub_query() as a secondary query.
    """
    search_config = mode_to_search(topic, mode)
    sub_query = _build_sub_query(topic, mode)

    queries = [search_config.query]
    if sub_query != search_config.query:
        queries.append(sub_query)

    return QueryPlan(
        intent=topic,
        subreddits=[subreddit],
        sub_queries={subreddit: queries},
        global_queries=[search_config.query],
        mode=mode,
        source="user_specified",
    )


# ---------------------------------------------------------------------------
# Subreddit auto-discovery (existing — kept for backward compat, checklist #14)
# ---------------------------------------------------------------------------

def _query_keywords(query: str) -> list[str]:
    """Extract lowercase keywords from query, dropping short filler words."""
    stopwords = {"a", "an", "the", "is", "of", "for", "in", "on", "to", "and", "or", "my", "with"}
    return [w.lower() for w in query.split() if len(w) > 2 and w.lower() not in stopwords]


def _relevance_score(name: str, description: str, keywords: list[str]) -> int:
    """Score a subreddit by how many query keywords appear in its name/description.

    Higher score = more relevant.  Zero means no keywords matched at all.
    """
    text = f"{name} {description}".lower()
    return sum(1 for kw in keywords if kw in text)


def find_subreddits(
    session: requests.Session,
    query: str,
    max_subs: int = 30,
) -> list[str]:
    """Discover relevant subreddits using multiple strategies.

    Strategies:
    0. **LLM expansion** (Claude) — asks an LLM to brainstorm related
       subreddit names (breed subs, platform subs, niche communities),
       then validates which ones actually exist.  Controlled by
       ``REDDIT_LLM_EXPANSION`` env var (default ``true``).
    1. Direct existence check — does ``r/{query_no_spaces}`` exist?
    2. Dedicated subreddit search — ``/subreddits/search.json`` (searches
       subreddit names and descriptions, finds niche subs too).
    3. Post search extraction — pull subreddit names from post results,
       filtered for relevance.

    Results are ranked by relevance score and subscriber count, then
    deduplicated.  LLM-suggested subs that pass validation get a relevance
    bonus so they rank higher.
    """
    # {name: subscribers} for ranking
    candidates: dict[str, int] = {}
    llm_validated: set[str] = set()  # track LLM-sourced subs for scoring bonus
    keywords = _query_keywords(query)

    # --- Strategy 0: LLM-powered expansion ---
    try:
        llm_suggestions = asyncio.run(_llm_expand_subreddits(query))
    except RuntimeError:
        # Already inside an event loop — fall back to sync-only strategies
        llm_suggestions = []
    if llm_suggestions:
        validated = _validate_subreddits(session, llm_suggestions, max_checks=30)
        for name, subs in validated.items():
            candidates[name] = subs
            llm_validated.add(name)

    # --- Strategy 1: Direct existence check ---
    slug = query.strip().replace(" ", "")
    if slug:
        check_url = f"{_BASE_URL}/r/{quote_plus(slug)}/about.json"
        data = _fetch_json(session, check_url)
        if data and isinstance(data, dict) and data.get("kind") == "t5":
            d = data.get("data", {})
            sub_name = d.get("display_name")
            if sub_name:
                candidates[sub_name] = int(d.get("subscribers", 0) or 0)
                log.info("Direct subreddit hit: r/%s (%d subscribers)", sub_name, candidates[sub_name])
        _sleep()

    # --- Strategy 2: Dedicated subreddit search (the key improvement) ---
    # This endpoint searches subreddit names AND descriptions, so it finds
    # both popular subs (r/dogs, r/goldenretrievers) and niche ones (r/Dogtoys).
    search_terms = [query]
    # Add the primary keyword solo (usually the subject, e.g. "dog")
    # and 2-word pairs to find broader coverage without false positives.
    if keywords:
        search_terms.append(keywords[0])  # subject keyword only
    if len(keywords) >= 2:
        # 2-word pairs keep context (e.g. "dog toy" is safe, "toy" alone is not)
        search_terms.append(f"{keywords[0]} {keywords[1]}")

    # {name: (subscribers, relevance_score, description)} for ranking
    scored: dict[str, tuple[int, int, str]] = {}

    for term in search_terms:
        params: dict[str, str] = {
            "q": term,
            "limit": "25",
        }
        data = _fetch_json(session, f"{_BASE_URL}/subreddits/search.json", params=params)
        if data and isinstance(data, dict):
            children = data.get("data", {}).get("children", [])
            for child in children:
                if child.get("kind") != "t5":
                    continue
                d = child.get("data", {})
                sub_name = d.get("display_name", "")
                description = d.get("public_description", "") or d.get("description", "")
                subscribers = int(d.get("subscribers", 0) or 0)
                if d.get("over18", False):
                    continue
                if sub_name and sub_name not in scored:
                    score = _relevance_score(sub_name, description, keywords)
                    if score > 0:
                        scored[sub_name] = (subscribers, score, description)
        _sleep()

    # --- Strategy 3: Post search extraction (scored for relevance) ---
    params = {
        "q": query,
        "sort": "relevance",
        "limit": str(min(_MAX_PER_PAGE, 100)),
        "t": "year",
    }
    data = _fetch_json(session, f"{_BASE_URL}/search.json", params=params)
    if data and isinstance(data, dict):
        children = data.get("data", {}).get("children", [])
        for child in children:
            sub = child.get("data", {}).get("subreddit", "")
            if sub and sub not in scored:
                score = _relevance_score(sub, "", keywords)
                if score > 0:
                    scored[sub] = (0, score, "")  # subscribers unknown
    _sleep()

    # --- Fetch subscriber counts for any candidates missing them ---
    unknowns = [name for name, (subs, _s, _d) in scored.items() if subs == 0]
    for name in unknowns[:5]:  # limit to avoid too many requests
        about_url = f"{_BASE_URL}/r/{quote_plus(name)}/about.json"
        data = _fetch_json(session, about_url)
        if data and isinstance(data, dict) and data.get("kind") == "t5":
            d = data.get("data", {})
            new_subs = int(d.get("subscribers", 0) or 0)
            desc = d.get("public_description", "") or ""
            new_score = _relevance_score(name, desc, keywords)
            scored[name] = (new_subs, max(scored[name][1], new_score), desc)
        _sleep()

    # Also add direct-hit candidates into the scored dict
    for name, subs in candidates.items():
        if name not in scored:
            scored[name] = (subs, _relevance_score(name, "", keywords) or 1, "")

    # Give LLM-validated subs a score bonus (+3) so they rank higher.
    # These are subs that Claude identified as semantically relevant even
    # if they don't contain the exact query keywords (e.g., breed subs).
    for name in llm_validated:
        if name in scored:
            subs, score, desc = scored[name]
            scored[name] = (subs, score + 3, desc)
        else:
            scored[name] = (candidates.get(name, 0), 3, "")

    # --- Rank and select ---
    if not scored:
        log.warning("No relevant subreddits found for query %r", query)
        return []

    # Sort by: relevance score DESC, then subscriber count DESC
    # This ensures subs matching more keywords rank higher, and among
    # equal scores, bigger communities come first.
    ranked = sorted(
        scored.items(),
        key=lambda x: (x[1][1], x[1][0]),  # (score, subscribers)
        reverse=True,
    )

    # Take top ranked, with a mix of popular and smaller niche subs
    selected: list[str] = []
    niche_slots = max(max_subs // 4, 1)  # reserve ~25% for niche subs
    niche_count = 0

    for name, (subs, score, _desc) in ranked:
        if len(selected) >= max_subs:
            break
        if subs < 1000:
            if niche_count < niche_slots:
                selected.append(name)
                niche_count += 1
        else:
            selected.append(name)

    # Backfill if we didn't fill all slots
    if len(selected) < max_subs:
        for name, _ in ranked:
            if name not in selected:
                selected.append(name)
                if len(selected) >= max_subs:
                    break

    log.info(
        "Discovered %d subreddits for query %r: %s (from %d candidates, scores: %s)",
        len(selected), query, selected, len(scored),
        {n: (s, sc) for n, (s, sc, _) in list(scored.items())[:15]},
    )
    return selected


# ---------------------------------------------------------------------------
# Post fetching (search + listing)
# ---------------------------------------------------------------------------

def _parse_posts(data: Any) -> list[dict[str, Any]]:
    """Extract post dicts from a Reddit listing response."""
    if not data or not isinstance(data, dict):
        return []
    children = data.get("data", {}).get("children", [])
    posts: list[dict[str, Any]] = []
    for child in children:
        if child.get("kind") != "t3":
            continue
        d = child.get("data", {})
        post_id = d.get("id", "")
        subreddit = d.get("subreddit", "")
        permalink = d.get("permalink", "")
        thread_url = f"{_BASE_URL}{permalink}" if permalink else ""
        link_url = d.get("url", "") or thread_url
        posts.append(
            {
                "source": "reddit_noapi",
                "id": post_id,
                "subreddit": subreddit,
                "title": d.get("title", ""),
                "thread_url": thread_url,
                "url": link_url,
                "body_text": d.get("selftext", "") or "",
                "upvote_ratio": d.get("upvote_ratio"),
                "score": int(d.get("score", 0) or 0),
                "num_comments": int(d.get("num_comments", 0) or 0),
                "created_utc": float(d.get("created_utc", 0) or 0),
                "top_comments": [],  # filled in phase 2
            }
        )
    return posts


def _search_posts(
    session: requests.Session,
    query: str,
    sort: str,
    subreddit: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    """Search Reddit for posts, paginating as needed up to *limit*."""
    collected: list[dict[str, Any]] = []
    after: str | None = None
    seen_ids: set[str] = set()

    while len(collected) < limit:
        page_size = min(_MAX_PER_PAGE, limit - len(collected))
        params: dict[str, str] = {
            "q": query,
            "sort": sort,
            "limit": str(page_size),
            "t": "month",
        }
        if after:
            params["after"] = after

        if subreddit:
            url = f"{_BASE_URL}/r/{quote_plus(subreddit)}/search.json"
            params["restrict_sr"] = "on"
        else:
            url = f"{_BASE_URL}/search.json"

        data = _fetch_json(session, url, params=params)
        if data is None:
            log.warning("Search request returned no data, stopping pagination.")
            break

        page_posts = _parse_posts(data)
        if not page_posts:
            break

        for post in page_posts:
            if post["id"] not in seen_ids:
                seen_ids.add(post["id"])
                collected.append(post)
                if len(collected) >= limit:
                    break

        after = data.get("data", {}).get("after")
        if not after:
            break

        _sleep()

    return collected


# ---------------------------------------------------------------------------
# Comment fetching
# ---------------------------------------------------------------------------

def _fetch_comments(
    session: requests.Session,
    subreddit: str,
    post_id: str,
    limit: int = DEFAULT_COMMENT_LIMIT,
) -> list[dict[str, Any]]:
    """Fetch top-level comments for a single post."""
    url = f"{_BASE_URL}/r/{quote_plus(subreddit)}/comments/{post_id}.json"
    params = {"limit": str(limit), "sort": "top"}

    data = _fetch_json(session, url, params=params)
    if not data or not isinstance(data, list) or len(data) < 2:
        return []

    comments_listing = data[1]
    children = comments_listing.get("data", {}).get("children", [])
    comments: list[dict[str, Any]] = []
    for child in children:
        if child.get("kind") != "t1":
            continue  # skip "more" stubs
        cd = child.get("data", {})
        author = cd.get("author") or "[deleted]"
        permalink = cd.get("permalink", "")
        comments.append(
            {
                "author": author,
                "score": int(cd.get("score", 0) or 0),
                "body": cd.get("body", "") or "",
                "permalink": f"{_BASE_URL}{permalink}" if permalink else "",
            }
        )
        if len(comments) >= limit:
            break

    return comments


# ---------------------------------------------------------------------------
# Intra-subreddit query builder (existing — kept for backward compat)
# ---------------------------------------------------------------------------

# Words that convey sentiment/intent rather than topic
_SENTIMENT_WORDS = frozenset({
    "frustration", "frustrated", "frustrating", "problem", "problems",
    "issue", "issues", "help", "struggling", "stuck", "fail", "failure",
    "pain", "painful", "annoying", "annoyed", "broken", "hate", "worst",
    "terrible", "awful", "rant", "vent", "complaint", "disappointed",
})

_PAIN_SEARCH_TERMS = [
    "frustrated", "frustrating", "struggling", "problem", "issue",
    "rant", "vent", "help", "stuck", "fail", "worst", "disappointed",
]

_MARKET_SEARCH_TERMS = [
    "price", "cost", "vs", "alternative", "compare", "switch",
    "recommend", "better than", "moved from", "migrate",
]


def _build_sub_query(topic: str, mode: str) -> str:
    """Build a lighter search query for use within auto-discovered subreddits.

    Since auto-discovered subs already provide topic context (e.g. r/shopify
    is inherently about ecommerce), repeating the full topic in the query is
    redundant and overly restrictive.  Instead we keep only:
    - 1-2 distinctive topic keywords (for minimal relevance anchoring)
    - Sentiment/intent terms appropriate for the mode
    """
    words = topic.lower().split()

    # Separate topic words from sentiment words
    topic_words = [w for w in words if w not in _SENTIMENT_WORDS]
    sentiment_from_topic = [w for w in words if w in _SENTIMENT_WORDS]

    if mode == "pain":
        # Combine sentiment words from the topic with standard pain terms
        pain_terms = list(dict.fromkeys(sentiment_from_topic + _PAIN_SEARCH_TERMS))
        pain_or = " OR ".join(f'"{t}"' for t in pain_terms)
        # Add the most distinctive topic word (longest = most specific)
        if topic_words:
            key_word = max(topic_words, key=len)
            return f"{key_word} ({pain_or})"
        return pain_or

    if mode == "market":
        market_or = " OR ".join(f'"{t}"' for t in _MARKET_SEARCH_TERMS)
        if topic_words:
            key_word = max(topic_words, key=len)
            return f"{key_word} ({market_or})"
        return market_or

    # General mode — just the topic keywords, OR'd for flexibility
    if topic_words:
        return " OR ".join(topic_words)
    return topic


# ---------------------------------------------------------------------------
# Fan-out search engine (checklist #9 — D4, D5)
# ---------------------------------------------------------------------------

def _fan_out_search(
    session: requests.Session,
    plan: QueryPlan,
    post_limit: int,
    sort: str,
    search_metadata: dict[str, Any],
    deadline: float,
) -> list[dict[str, Any]]:
    """Execute the QueryPlan by running multiple queries per subreddit.

    Implements two-phase round-robin search (D4):
      Phase 1 (breadth): For each sub, run FIRST query only, collect 1-2 posts.
                          Do NOT stop early -- search ALL subs.
      Phase 2 (depth):   For yielding subs, run remaining queries.
                          Stop when post_limit reached.

    Includes quote fallback (D5): if a query with quotes returns 0, retry
    with quotes stripped. Max 1 extra retry per sub.
    """
    all_posts: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    yielding_subs: list[str] = []
    queries_executed = 0
    quote_retries = 0

    num_subs = len(plan.subreddits)
    per_query_limit = max(2, min(5, post_limit // max(num_subs, 1)))

    log.info(
        "Fan-out search: %d subs, %d posts/query target, post_limit=%d",
        num_subs, per_query_limit, post_limit,
    )

    def _timed_out() -> bool:
        return time.monotonic() > deadline

    def _run_query(sub: str | None, query_str: str, limit: int) -> list[dict[str, Any]]:
        """Run a single search query, applying sanitization."""
        nonlocal queries_executed
        sanitized = _sanitize_query(query_str)
        if not sanitized:
            return []
        queries_executed += 1
        return _search_posts(session, sanitized, sort, sub, limit)

    def _collect(posts: list[dict[str, Any]]) -> int:
        """Add posts to all_posts, deduplicating. Returns count of new posts."""
        added = 0
        for p in posts:
            if p["id"] not in seen_ids:
                seen_ids.add(p["id"])
                all_posts.append(p)
                added += 1
        return added

    # --- Phase 1 (breadth): Run FIRST query for EACH sub (D4) ---
    for sub in plan.subreddits:
        if _timed_out():
            search_metadata["warnings"].append("Pipeline timeout during Phase 1 breadth")
            break

        queries = plan.queries_for_sub(sub)
        if not queries:
            continue

        first_query = queries[0]
        log.info("Phase 1: Searching r/%s with query: %r", sub, first_query)
        posts = _run_query(sub, first_query, per_query_limit)

        # Quote fallback (D5): if query has quotes and returned 0, retry without
        if not posts and '"' in first_query:
            stripped = first_query.replace('"', '')
            log.info("Phase 1: Quote fallback for r/%s, retrying: %r", sub, stripped)
            posts = _run_query(sub, stripped, per_query_limit)
            quote_retries += 1

        new_count = _collect(posts)
        if new_count > 0:
            yielding_subs.append(sub)

        _sleep()

    search_metadata["subreddits_searched"] = len(plan.subreddits)
    search_metadata["subreddits_yielded"] = len(yielding_subs)

    log.info(
        "Phase 1 complete: %d posts from %d/%d subs",
        len(all_posts), len(yielding_subs), num_subs,
    )

    # --- Phase 2 (depth): Run remaining queries for yielding subs (D4) ---
    if len(all_posts) < post_limit and yielding_subs:
        for sub in yielding_subs:
            if len(all_posts) >= post_limit or _timed_out():
                break

            queries = plan.queries_for_sub(sub)
            # Skip the first query (already run in Phase 1), run the rest
            for query_str in queries[1:]:
                if len(all_posts) >= post_limit or _timed_out():
                    break

                log.info("Phase 2: Searching r/%s with query: %r", sub, query_str)
                posts = _run_query(sub, query_str, per_query_limit)

                # Quote fallback (D5)
                if not posts and '"' in query_str:
                    stripped = query_str.replace('"', '')
                    log.info("Phase 2: Quote fallback for r/%s, retrying: %r", sub, stripped)
                    posts = _run_query(sub, stripped, per_query_limit)
                    quote_retries += 1

                _collect(posts)
                _sleep()

    search_metadata["posts_before_dedup"] = queries_executed  # approximate
    search_metadata["posts_after_dedup"] = len(all_posts)
    search_metadata["total_queries_executed"] = queries_executed

    # --- Global fallback: if very low yield, search r/all (D5/D9) ---
    threshold = max(5, post_limit // 4)
    if len(all_posts) < threshold and not _timed_out():
        search_metadata["global_fallback_triggered"] = True
        log.info("Low yield (%d posts < %d); running global fallback queries", len(all_posts), threshold)
        for gq in plan.global_queries:
            if len(all_posts) >= post_limit or _timed_out():
                break
            posts = _run_query(None, gq, post_limit - len(all_posts))
            _collect(posts)
            _sleep()

    return all_posts[:post_limit]


# ---------------------------------------------------------------------------
# Public API (checklist #11 — rewritten with query plan + hard timeout D8)
# ---------------------------------------------------------------------------

def fetch_posts_noapi(
    topic: str,
    subreddit: str | None,
    mode: str,
    post_limit: int = 20,
) -> list[dict[str, Any]]:
    """Fetch Reddit posts and comments without API credentials.

    Parameters
    ----------
    topic:
        Search keyword / topic string.
    subreddit:
        Optional subreddit to scope the search. If *None*, auto-discovers
        relevant subreddits and searches across them.
    mode:
        Research mode -- ``"pain"``, ``"market"``, or ``"general"``.
    post_limit:
        Maximum number of posts to return.

    Returns
    -------
    list[dict[str, Any]]
        Posts in the standard schema (matches PRAW output format).
    """
    pipeline_start = time.monotonic()
    deadline = pipeline_start + _PIPELINE_TIMEOUT_S

    # Search metadata (checklist #12 — D9)
    search_metadata: dict[str, Any] = {
        "plan_source": "unknown",
        "intent": "",
        "subreddits_suggested": 0,
        "subreddits_validated": 0,
        "subreddits_searched": 0,
        "subreddits_yielded": 0,
        "total_queries_executed": 0,
        "posts_before_dedup": 0,
        "posts_after_dedup": 0,
        "backfill_triggered": False,
        "global_fallback_triggered": False,
        "warnings": [],
    }

    session = _build_session()

    # --- Step 1: Build the query plan ---
    if subreddit:
        # User specified a subreddit: build a targeted plan
        plan = _build_user_specified_plan(topic, mode, subreddit)
        search_metadata["plan_source"] = "user_specified"
        search_metadata["intent"] = topic
        search_metadata["subreddits_suggested"] = 1
        search_metadata["subreddits_validated"] = 1
    else:
        # Auto-discover: use LLM with fallback
        plan = None
        try:
            plan = asyncio.run(_llm_build_query_plan(topic, mode))
        except RuntimeError:
            # Already inside an event loop
            pass

        if plan is None:
            # LLM unavailable or failed -- use keyword fallback
            log.info("Using fallback query plan (no LLM)")
            plan = _build_fallback_query_plan(topic, mode)
            search_metadata["plan_source"] = "fallback"
            search_metadata["intent"] = topic

            # Discover subreddits using keyword methods only.
            # Skip LLM expansion in find_subreddits() since the LLM
            # already failed/timed out above — no point retrying.
            prev_llm = os.environ.get("REDDIT_LLM_EXPANSION")
            os.environ["REDDIT_LLM_EXPANSION"] = "false"
            try:
                plan.subreddits = find_subreddits(session, topic)
            finally:
                if prev_llm is None:
                    os.environ.pop("REDDIT_LLM_EXPANSION", None)
                else:
                    os.environ["REDDIT_LLM_EXPANSION"] = prev_llm
            search_metadata["subreddits_suggested"] = len(plan.subreddits)

            # Apply the sub_query uniformly to all discovered subs
            sub_query = _build_sub_query(topic, mode)
            for sub in plan.subreddits:
                plan.sub_queries[sub] = [sub_query]
        else:
            # LLM plan succeeded -- validate the suggested subreddits
            search_metadata["plan_source"] = "llm"
            search_metadata["intent"] = plan.intent
            search_metadata["subreddits_suggested"] = len(plan.subreddits)

            log.info(
                "LLM query plan: intent=%r, %d subs, source=%s",
                plan.intent, len(plan.subreddits), plan.source,
            )

            # Cap validation at 20 subs (D3, checklist #13)
            validated = _validate_subreddits(session, plan.subreddits, max_checks=20)
            search_metadata["subreddits_validated"] = len(validated)

            # Log warning if >30% fail validation (D3)
            checked_count = min(len(plan.subreddits), 20)
            if checked_count > 0:
                fail_rate = 1 - (len(validated) / checked_count)
                if fail_rate > 0.30:
                    warn_msg = (
                        f"{checked_count - len(validated)}/{checked_count} "
                        "suggested subs failed validation; LLM quality may be degraded"
                    )
                    log.warning(warn_msg)
                    search_metadata["warnings"].append(warn_msg)

            # Keep only validated subs, preserve LLM ordering
            valid_names = set(validated.keys())
            plan.subreddits = [s for s in plan.subreddits if s in valid_names]
            # Remove sub_queries for invalid subs
            plan.sub_queries = {
                s: qs for s, qs in plan.sub_queries.items()
                if s in valid_names
            }
            log.info("After validation: %d subreddits remain", len(plan.subreddits))

    # --- Step 2: Determine sort order ---
    search_config = mode_to_search(topic, mode)
    sort = search_config.sort

    # --- Step 3: Execute fan-out search ---
    all_posts = _fan_out_search(session, plan, post_limit, sort, search_metadata, deadline)
    log.info("Fan-out search complete: %d posts collected", len(all_posts))

    # --- Step 4: Fetch comments (unchanged) ---
    for idx, post in enumerate(all_posts):
        if time.monotonic() > deadline:
            elapsed = time.monotonic() - pipeline_start
            warn_msg = f"Pipeline timeout at {elapsed:.0f}s during comment fetch"
            log.warning(warn_msg)
            search_metadata["warnings"].append(warn_msg)
            break

        post_id = post["id"]
        sub = post["subreddit"]
        if not post_id or not sub:
            continue
        log.debug(
            "Fetching comments %d/%d: post %s in r/%s",
            idx + 1, len(all_posts), post_id, sub,
        )
        post["top_comments"] = _fetch_comments(
            session, sub, post_id, limit=DEFAULT_COMMENT_LIMIT,
        )
        _sleep()

    elapsed = time.monotonic() - pipeline_start

    # Log search metadata (D9)
    search_metadata["posts_after_dedup"] = len(all_posts)
    search_metadata["elapsed_seconds"] = round(elapsed, 1)
    log.info("search_metadata: %s", json.dumps(search_metadata, indent=2))

    log.info(
        "fetch_posts_noapi complete: %d posts, %d total comments, %.1fs elapsed",
        len(all_posts),
        sum(len(p.get("top_comments", [])) for p in all_posts),
        elapsed,
    )
    return all_posts
