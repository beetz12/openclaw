#!/usr/bin/env python3
"""X (Twitter) Research Agent CLI.

Examples:
  python x_scout.py --query "AI Automation Agency" --mode leads
  python x_scout.py --query "Handmade Dog Toys" --mode trends
  python x_scout.py --query "@some_handle" --mode competitor
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

_SCRIPT_DIR = Path(__file__).resolve().parent
RAW_DUMP_PATH = _SCRIPT_DIR / "logs" / "x_data_dump.json"
REPORTS_DIR = _SCRIPT_DIR / "reports"
MAX_RESULTS = 30


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="X (Twitter) Research Agent")
    parser.add_argument("--query", required=True, help='Search string, e.g. "AI Agency" or "@handle".')
    parser.add_argument(
        "--mode",
        required=True,
        choices=("leads", "trends", "competitor"),
        help="Research mode.",
    )
    return parser.parse_args()


def extract_handle(query: str) -> str | None:
    match = re.search(r"@([A-Za-z0-9_]{1,15})", query)
    return match.group(1) if match else None


def build_x_query(query: str, mode: str) -> str:
    q = query.strip()
    if mode == "leads":
        intent = '(hiring OR "looking for" OR "help needed" OR recommendations)'
        return f"({q}) {intent} lang:en -is:retweet"
    if mode == "trends":
        return f"({q}) min_faves:50 lang:en -is:retweet"
    if mode == "competitor":
        handle = extract_handle(q)
        if not handle:
            raise ValueError("competitor mode requires a @handle in --query.")
        return f"from:{handle} -is:retweet"
    return q


def normalize_tweet(item: dict[str, Any]) -> dict[str, Any]:
    user = item.get("user") or item.get("author") or {}
    username = (
        user.get("username")
        or user.get("screen_name")
        or user.get("handle")
        or item.get("username")
        or "unknown"
    )
    tweet_id = str(item.get("id") or item.get("tweet_id") or "")
    tweet_url = item.get("url")
    if not tweet_url and tweet_id:
        tweet_url = f"https://x.com/{username}/status/{tweet_id}"

    return {
        "source": "rapidapi_twitterapi",
        "id": tweet_id or None,
        "text": item.get("text") or item.get("full_text") or "",
        "created_at": item.get("created_at") or item.get("date"),
        "like_count": item.get("like_count") or item.get("favorite_count") or 0,
        "reply_count": item.get("reply_count") or 0,
        "retweet_count": item.get("retweet_count") or 0,
        "quote_count": item.get("quote_count") or 0,
        "tweet_url": tweet_url,
        "user": {
            "username": username,
            "name": user.get("name"),
            "bio": user.get("description") or user.get("bio") or item.get("user_bio"),
            "followers_count": user.get("followers_count"),
        },
    }


def parse_rapidapi_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    candidates = (
        payload.get("tweets")
        or payload.get("results")
        or payload.get("data")
        or payload.get("statuses")
        or []
    )
    out: list[dict[str, Any]] = []
    for item in candidates:
        if isinstance(item, dict):
            out.append(normalize_tweet(item))
    return out


def rapidapi_search(query: str, mode: str) -> tuple[list[dict[str, Any]], str | None]:
    import requests

    rapid_key = os.getenv("RAPIDAPI_KEY")
    if not rapid_key:
        return [], "RAPIDAPI_KEY missing"

    rapid_host = os.getenv("RAPIDAPI_HOST", "twitterapi-io.p.rapidapi.com")
    explicit_url = os.getenv("RAPIDAPI_SEARCH_URL")
    urls = [
        explicit_url,
        f"https://{rapid_host}/twitter/tweet/advanced_search",
        f"https://{rapid_host}/twitter/tweet/search",
    ]
    urls = [u for u in urls if u]

    headers = {
        "x-rapidapi-key": rapid_key,
        "x-rapidapi-host": rapid_host,
        "accept": "application/json",
    }

    built_query = build_x_query(query, mode)
    body = {"query": built_query, "q": built_query, "count": MAX_RESULTS, "limit": MAX_RESULTS}
    params = {"query": built_query, "q": built_query, "count": MAX_RESULTS, "limit": MAX_RESULTS}

    last_error: str | None = None
    for url in urls:
        for method in ("GET", "POST"):
            try:
                if method == "GET":
                    resp = requests.get(url, headers=headers, params=params, timeout=25)
                else:
                    resp = requests.post(url, headers=headers, json=body, timeout=25)
                if resp.status_code >= 400:
                    last_error = f"{method} {url} -> {resp.status_code}"
                    continue
                payload = resp.json()
                parsed = parse_rapidapi_payload(payload)
                if parsed:
                    return parsed[:MAX_RESULTS], None
                last_error = f"{method} {url} returned zero items"
            except Exception as exc:
                last_error = f"{method} {url} failed: {type(exc).__name__}: {exc}"
    return [], last_error or "RapidAPI request failed"


async def brave_fallback_search(query: str, mode: str) -> tuple[list[dict[str, Any]], str | None]:
    try:
        from brave_search_python_client import BraveSearch, WebSearchRequest
    except ImportError as exc:
        return [], f"brave-search client import failed: {exc}"

    if not os.getenv("BRAVE_SEARCH_API_KEY"):
        return [], "BRAVE_SEARCH_API_KEY missing"

    built_query = build_x_query(query, mode)
    brave_query = f"site:twitter.com {built_query}"

    try:
        bs = BraveSearch()
        response = await bs.web(WebSearchRequest(q=brave_query, count=MAX_RESULTS))
        results = response.web.results if response.web else []
        items: list[dict[str, Any]] = []
        for res in results[:MAX_RESULTS]:
            url = getattr(res, "url", None)
            items.append(
                {
                    "source": "brave_search_fallback",
                    "id": None,
                    "text": getattr(res, "description", "") or "",
                    "created_at": None,
                    "like_count": None,
                    "reply_count": None,
                    "retweet_count": None,
                    "quote_count": None,
                    "tweet_url": url,
                    "user": {
                        "username": None,
                        "name": getattr(res, "title", None),
                        "bio": None,
                        "followers_count": None,
                    },
                }
            )
        return items, None
    except Exception as exc:
        return [], f"Brave search failed: {type(exc).__name__}: {exc}"


def search_twitter(query: str, mode: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    primary, primary_error = rapidapi_search(query, mode)
    if primary:
        return primary, {"source": "rapidapi_twitterapi", "primary_error": primary_error, "fallback_error": None}

    fallback, fallback_error = asyncio.run(brave_fallback_search(query, mode))
    if fallback:
        return fallback, {"source": "brave_search_fallback", "primary_error": primary_error, "fallback_error": fallback_error}

    return [], {"source": "none", "primary_error": primary_error, "fallback_error": fallback_error}


def compact_for_llm(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compacted: list[dict[str, Any]] = []
    for row in rows:
        compacted.append(
            {
                "text": (row.get("text") or "")[:900],
                "tweet_url": row.get("tweet_url"),
                "like_count": row.get("like_count"),
                "reply_count": row.get("reply_count"),
                "retweet_count": row.get("retweet_count"),
                "user": {
                    "username": (row.get("user") or {}).get("username"),
                    "name": (row.get("user") or {}).get("name"),
                    "bio": ((row.get("user") or {}).get("bio") or "")[:500],
                },
            }
        )
    return compacted


def build_prompt(query: str, mode: str, rows: list[dict[str, Any]]) -> str:
    mode_instruction = {
        "leads": (
            "Filter for strong buyer/service intent only. Exclude general news and commentary. "
            "Keep only users actively asking for help/services/recommendations."
        ),
        "competitor": (
            "Identify content pillars and what gets the highest engagement. "
            "Summarize themes, post formats, and likely strategy."
        ),
        "trends": (
            "Summarize the current vibe, recurring talking points, and why people engage."
        ),
    }[mode]

    instruction = f"""
You are a senior social intelligence analyst.
Analyze X/Twitter data for query "{query}" in mode "{mode}".

Rules:
1) Use only supplied data.
2) Include direct tweet links in markdown.
3) Be concise but concrete.
4) Quote short evidence snippets.

Mode objective:
{mode_instruction}

Required output sections:
- Executive Summary
- Key Findings (bullets with evidence + links)
- Actionable Recommendations
""".strip()

    payload = json.dumps(compact_for_llm(rows), ensure_ascii=True, indent=2)
    return f"{instruction}\n\nData:\n```json\n{payload}\n```"


async def analyze_with_claude(query_value: str, mode: str, rows: list[dict[str, Any]]) -> str:
    from claude_agent_sdk import AssistantMessage, ClaudeAgentOptions, TextBlock, query

    # Remove CLAUDECODE guard so SDK can spawn a CLI subprocess
    os.environ.pop("CLAUDECODE", None)

    prompt = build_prompt(query_value, mode, rows)
    options = ClaudeAgentOptions(
        cwd=str(Path.cwd()),
        permission_mode="bypassPermissions",
        max_turns=1,
    )

    chunks: list[str] = []
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    chunks.append(block.text)
    text = "\n".join(x for x in chunks if x.strip()).strip()
    if not text:
        raise RuntimeError("Claude returned no analysis.")
    return text


def heuristic_fallback_report(reason: str, rows: list[dict[str, Any]]) -> str:
    lines = [
        "## Executive Summary",
        f"Claude analysis failed (`{reason}`). This is a lightweight fallback summary.",
        "",
        "## Key Findings",
    ]
    sorted_rows = sorted(
        rows,
        key=lambda r: (
            int(r.get("like_count") or 0),
            int(r.get("reply_count") or 0),
            int(r.get("retweet_count") or 0),
        ),
        reverse=True,
    )
    for i, row in enumerate(sorted_rows[:10], start=1):
        text = (row.get("text") or "").replace("\n", " ").strip()
        text = (text[:180] + "...") if len(text) > 180 else text
        link = row.get("tweet_url") or ""
        likes = row.get("like_count")
        replies = row.get("reply_count")
        lines.append(f"{i}. {text} ([link]({link})) - likes: {likes}, replies: {replies}")
    lines.extend(["", "## Actionable Recommendations", "- Re-run once Claude CLI auth is confirmed."])
    return "\n".join(lines)


def save_raw_dump(payload: dict[str, Any]) -> None:
    RAW_DUMP_PATH.parent.mkdir(parents=True, exist_ok=True)
    RAW_DUMP_PATH.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")


def slugify(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", value.strip()).strip("_") or "query"


def render_report(query_value: str, mode: str, analysis_md: str, rows: list[dict[str, Any]]) -> str:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        f"# X Intelligence Report: {query_value}",
        "",
        f"- Generated: {timestamp}",
        f"- Mode: `{mode}`",
        f"- Records Analyzed: `{len(rows)}`",
        "",
        analysis_md.strip(),
        "",
        "## Tweet Links",
    ]
    for i, row in enumerate(rows, start=1):
        link = row.get("tweet_url") or ""
        username = (row.get("user") or {}).get("username") or "unknown"
        likes = row.get("like_count")
        replies = row.get("reply_count")
        lines.append(f"{i}. [{username}]({link}) - likes: {likes}, replies: {replies}")
    return "\n".join(lines) + "\n"


def save_report(query_value: str, report_md: str) -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    date_tag = datetime.now().strftime("%Y-%m-%d")
    filename = f"X_Intel_{slugify(query_value)}_{date_tag}.md"
    path = REPORTS_DIR / filename
    path.write_text(report_md, encoding="utf-8")
    return path


def main() -> int:
    try:
        from dotenv import load_dotenv
    except ImportError:
        def load_dotenv(*_a, **_kw) -> None:
            return None

    load_dotenv(Path(__file__).resolve().parent / ".env")
    args = parse_args()

    try:
        # validate early
        _ = build_x_query(args.query, args.mode)
    except Exception as exc:
        print(f"Invalid query/mode configuration: {exc}", file=sys.stderr)
        return 2

    rows, search_meta = search_twitter(args.query, args.mode)
    if not rows:
        print("No results from primary or fallback data sources.", file=sys.stderr)
        print(json.dumps(search_meta, indent=2), file=sys.stderr)
        return 1

    dump = {
        "query": args.query,
        "mode": args.mode,
        "generated_at": datetime.now().isoformat(),
        "search_meta": search_meta,
        "count": len(rows),
        "results": rows,
    }
    save_raw_dump(dump)

    try:
        analysis = asyncio.run(analyze_with_claude(args.query, args.mode, rows))
    except Exception as exc:
        analysis = heuristic_fallback_report(f"{type(exc).__name__}: {exc}", rows)

    report_md = render_report(args.query, args.mode, analysis, rows)
    report_path = save_report(args.query, report_md)

    print(f"Raw data dump saved to: {RAW_DUMP_PATH}")
    print(f"Report saved to: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
