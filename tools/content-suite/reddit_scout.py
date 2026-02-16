#!/usr/bin/env python3
"""Reddit Intelligence Agent CLI.

Usage example:
    python reddit_scout.py --topic "OpenClaw" --mode pain --subreddit LocalLLaMA
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

DEFAULT_POST_LIMIT = 20
DEFAULT_COMMENT_LIMIT = 5
_SCRIPT_DIR = Path(__file__).resolve().parent
REDDIT_DUMP_PATH = _SCRIPT_DIR / "logs" / "reddit_data_dump.json"
REPORTS_DIR = _SCRIPT_DIR / "reports"


@dataclass(frozen=True)
class SearchConfig:
    mode: str
    query: str
    sort: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reddit Intelligence Agent")
    parser.add_argument("--topic", required=True, help="Keyword/topic to research.")
    parser.add_argument(
        "--subreddit",
        default=None,
        help="Optional subreddit scope (for example: LocalLLaMA, SaaS).",
    )
    parser.add_argument(
        "--mode",
        required=True,
        choices=("pain", "market", "general"),
        help="Research mode.",
    )
    return parser.parse_args()


def mode_to_search(topic: str, mode: str) -> SearchConfig:
    topic = topic.strip()
    if mode == "pain":
        return SearchConfig(
            mode=mode,
            query=f'({topic}) ("help" OR "issue" OR "stuck" OR "fail")',
            sort="comments",
        )
    if mode == "market":
        return SearchConfig(
            mode=mode,
            query=f'({topic}) ("price" OR "cost" OR "vs" OR "alternative")',
            sort="relevance",
        )
    return SearchConfig(mode=mode, query=topic, sort="hot")


def ensure_reddit_env() -> None:
    missing = [
        key
        for key in ("REDDIT_CLIENT_ID", "REDDIT_SECRET", "REDDIT_USER_AGENT")
        if not os.getenv(key)
    ]
    if missing:
        joined = ", ".join(missing)
        raise RuntimeError(f"Missing required Reddit env vars: {joined}")


def init_reddit_client() -> Any:
    import praw

    ensure_reddit_env()
    return praw.Reddit(
        client_id=os.environ["REDDIT_CLIENT_ID"],
        client_secret=os.environ["REDDIT_SECRET"],
        user_agent=os.environ["REDDIT_USER_AGENT"],
    )


def extract_top_comments(submission: Any, limit: int = DEFAULT_COMMENT_LIMIT) -> list[dict[str, Any]]:
    submission.comment_sort = "top"
    submission.comments.replace_more(limit=0)
    top_comments: list[dict[str, Any]] = []
    for comment in submission.comments[:limit]:
        author = str(comment.author) if comment.author else "[deleted]"
        top_comments.append(
            {
                "author": author,
                "score": int(getattr(comment, "score", 0) or 0),
                "body": getattr(comment, "body", "") or "",
                "permalink": f"https://www.reddit.com{getattr(comment, 'permalink', '')}",
            }
        )
    return top_comments


def fetch_posts_with_praw(
    topic: str,
    subreddit: str | None,
    mode: str,
    post_limit: int = DEFAULT_POST_LIMIT,
) -> list[dict[str, Any]]:
    reddit = init_reddit_client()
    search = mode_to_search(topic, mode)
    target = reddit.subreddit(subreddit) if subreddit else reddit.subreddit("all")

    posts: list[dict[str, Any]] = []
    for submission in target.search(search.query, sort=search.sort, limit=post_limit):
        posts.append(
            {
                "source": "reddit_api",
                "id": submission.id,
                "subreddit": str(submission.subreddit),
                "title": submission.title,
                "thread_url": f"https://www.reddit.com{submission.permalink}",
                "url": submission.url,
                "body_text": submission.selftext or "",
                "upvote_ratio": getattr(submission, "upvote_ratio", None),
                "score": int(getattr(submission, "score", 0) or 0),
                "num_comments": int(getattr(submission, "num_comments", 0) or 0),
                "created_utc": float(getattr(submission, "created_utc", 0) or 0),
                "top_comments": extract_top_comments(submission, limit=DEFAULT_COMMENT_LIMIT),
            }
        )
    return posts


def fetch_posts_with_brave(
    topic: str,
    subreddit: str | None,
    mode: str,
    limit: int = DEFAULT_POST_LIMIT,
) -> list[dict[str, Any]]:
    brave_key = os.getenv("BRAVE_API_KEY")
    if not brave_key:
        raise RuntimeError("BRAVE_API_KEY is missing, cannot run fallback search.")

    search = mode_to_search(topic, mode)
    subreddit_filter = f" site:reddit.com/r/{subreddit}" if subreddit else " site:reddit.com"
    combined_query = f"{search.query}{subreddit_filter}"
    encoded_query = quote_plus(combined_query)
    url = f"https://api.search.brave.com/res/v1/web/search?q={encoded_query}&count={limit}"

    req = Request(
        url=url,
        headers={
            "Accept": "application/json",
            "X-Subscription-Token": brave_key,
        },
    )
    with urlopen(req, timeout=30) as response:
        raw = response.read().decode("utf-8")
    payload = json.loads(raw)

    results = payload.get("web", {}).get("results", [])
    posts: list[dict[str, Any]] = []
    for item in results[:limit]:
        result_url = item.get("url") or ""
        posts.append(
            {
                "source": "brave_search_fallback",
                "id": item.get("profile", {}).get("name") or result_url,
                "subreddit": subreddit or "unknown",
                "title": item.get("title", "Untitled"),
                "thread_url": result_url,
                "url": result_url,
                "body_text": item.get("description", "") or "",
                "upvote_ratio": None,
                "score": None,
                "num_comments": None,
                "created_utc": None,
                "top_comments": [],
            }
        )
    return posts


def compact_posts_for_llm(posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compacted: list[dict[str, Any]] = []
    for post in posts:
        compacted.append(
            {
                "subreddit": post.get("subreddit"),
                "title": post.get("title"),
                "thread_url": post.get("thread_url"),
                "body_text": (post.get("body_text") or "")[:1800],
                "upvote_ratio": post.get("upvote_ratio"),
                "num_comments": post.get("num_comments"),
                "top_comments": [
                    {
                        "author": c.get("author"),
                        "score": c.get("score"),
                        "body": (c.get("body") or "")[:700],
                        "permalink": c.get("permalink"),
                    }
                    for c in post.get("top_comments", [])
                ],
            }
        )
    return compacted


def build_analysis_prompt(topic: str, mode: str, posts: list[dict[str, Any]]) -> str:
    mode_guidance = {
        "pain": (
            "Focus on pain points, failure modes, recurring frustrations, and unmet needs. "
            "Explicitly identify lead candidates: users asking for help/solutions, with evidence."
        ),
        "market": (
            "Focus on buying intent, pricing sensitivity, alternatives, competitor mentions, and switching triggers."
        ),
        "general": (
            "Focus on sentiment, key narratives, trends, and strategic takeaways."
        ),
    }
    instructions = f"""
You are a Senior Research Analyst.
Analyze Reddit data for topic "{topic}" in mode "{mode}".

Rules:
1) Use only the provided data.
2) Quote concise evidence snippets.
3) Include clickable markdown links for cited threads.
4) Be concrete and action-oriented.
5) If mode is pain, include a "Leads" section with usernames (if present), problem, and what product could help.

Primary objective:
{mode_guidance[mode]}

Output format (markdown):
- Executive Summary
- Key Findings (bullet list with evidence + link)
- Sentiment Snapshot
- Opportunities
- Leads (required for pain mode; otherwise optional)
- Suggested Next Experiments
""".strip()

    data_blob = json.dumps(posts, ensure_ascii=True, indent=2)
    return f"{instructions}\n\nData:\n```json\n{data_blob}\n```"


async def run_claude_analysis(topic: str, mode: str, posts: list[dict[str, Any]]) -> str:
    from claude_agent_sdk import AssistantMessage, ClaudeAgentOptions, TextBlock, query

    # Remove CLAUDECODE guard so SDK can spawn a CLI subprocess
    os.environ.pop("CLAUDECODE", None)

    prompt = build_analysis_prompt(topic, mode, compact_posts_for_llm(posts))
    options = ClaudeAgentOptions(
        cwd=str(Path.cwd()),
        permission_mode="bypassPermissions",
        max_turns=1,
    )

    text_chunks: list[str] = []
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    text_chunks.append(block.text)

    analysis = "\n".join(chunk for chunk in text_chunks if chunk.strip()).strip()
    if not analysis:
        raise RuntimeError("Claude returned no text analysis.")
    return analysis


def heuristic_fallback_analysis(topic: str, mode: str, posts: list[dict[str, Any]], reason: str) -> str:
    lines = [
        "## Executive Summary",
        f"Claude analysis failed (`{reason}`). This is a heuristic fallback summary for topic **{topic}** in mode **{mode}**.",
        "",
        "## Key Findings",
    ]
    for idx, post in enumerate(posts[:10], start=1):
        title = post.get("title", "Untitled")
        link = post.get("thread_url") or post.get("url") or ""
        comments = post.get("num_comments")
        upvote_ratio = post.get("upvote_ratio")
        lines.append(
            f"{idx}. [{title}]({link})"
            f" - comments: {comments if comments is not None else 'n/a'}, upvote_ratio: {upvote_ratio if upvote_ratio is not None else 'n/a'}"
        )
    lines.extend(
        [
            "",
            "## Opportunities",
            "- Run again after verifying Claude CLI authentication and .env credentials.",
            "- Increase specificity by using `--subreddit` and pain/market mode.",
        ]
    )
    if mode == "pain":
        lines.extend(["", "## Leads", "- No verified leads extracted in fallback mode."])
    return "\n".join(lines)


def write_json_dump(payload: dict[str, Any], path: Path = REDDIT_DUMP_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def slugify(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", value.strip()).strip("_") or "topic"


def build_report_markdown(
    topic: str,
    mode: str,
    subreddit: str | None,
    analysis_md: str,
    posts: list[dict[str, Any]],
) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        f"# Reddit Research Report: {topic}",
        "",
        f"- Generated: {now}",
        f"- Mode: `{mode}`",
        f"- Subreddit Scope: `{subreddit or 'all'}`",
        f"- Threads Analyzed: `{len(posts)}`",
        "",
        analysis_md.strip(),
        "",
        "## Thread Index",
    ]
    for idx, post in enumerate(posts, start=1):
        title = post.get("title", "Untitled")
        link = post.get("thread_url") or post.get("url") or ""
        lines.append(f"{idx}. [{title}]({link})")
    lines.append("")
    return "\n".join(lines)


def write_report(topic: str, report_md: str) -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    date_tag = datetime.now().strftime("%Y-%m-%d")
    file_name = f"Reddit_Research_{slugify(topic)}_{date_tag}.md"
    report_path = REPORTS_DIR / file_name
    report_path.write_text(report_md, encoding="utf-8")
    return report_path


def main() -> int:
    try:
        from dotenv import load_dotenv
    except ImportError:
        def load_dotenv(*_a, **_kw) -> None:
            return None

    load_dotenv(Path(__file__).resolve().parent / ".env")
    args = parse_args()

    scraper_mode = os.getenv("REDDIT_SCRAPER_MODE", "noapi").lower()

    praw_error: str | None = None
    noapi_error: str | None = None
    posts: list[dict[str, Any]] = []

    if scraper_mode == "noapi":
        try:
            from reddit_scout_noapi import fetch_posts_noapi

            posts = fetch_posts_noapi(args.topic, args.subreddit, args.mode, post_limit=DEFAULT_POST_LIMIT)
            if not posts:
                noapi_error = "No-API scraper returned zero posts."
        except Exception as exc:
            noapi_error = f"{type(exc).__name__}: {exc}"
    else:
        # PRAW mode (original behaviour)
        try:
            posts = fetch_posts_with_praw(args.topic, args.subreddit, args.mode, post_limit=DEFAULT_POST_LIMIT)
            if not posts:
                praw_error = "PRAW returned zero posts."
        except Exception as exc:
            praw_error = f"{type(exc).__name__}: {exc}"

    used_fallback = False
    fallback_error: str | None = None
    if not posts:
        used_fallback = True
        try:
            posts = fetch_posts_with_brave(args.topic, args.subreddit, args.mode, limit=DEFAULT_POST_LIMIT)
        except Exception as exc:
            fallback_error = f"{type(exc).__name__}: {exc}"

    if not posts:
        print("No data returned from Reddit API or Brave fallback.", file=sys.stderr)
        if noapi_error:
            print(f"No-API scraper error: {noapi_error}", file=sys.stderr)
        if praw_error:
            print(f"PRAW error: {praw_error}", file=sys.stderr)
        if fallback_error:
            print(f"Brave fallback error: {fallback_error}", file=sys.stderr)
        return 1

    raw_dump = {
        "topic": args.topic,
        "mode": args.mode,
        "subreddit": args.subreddit,
        "generated_at": datetime.now().isoformat(),
        "source": "brave_search_fallback" if used_fallback else ("noapi_scraper" if scraper_mode == "noapi" else "reddit_api"),
        "scraper_mode": scraper_mode,
        "noapi_error": noapi_error,
        "praw_error": praw_error,
        "fallback_error": fallback_error,
        "post_count": len(posts),
        "posts": posts,
    }
    write_json_dump(raw_dump, REDDIT_DUMP_PATH)

    try:
        analysis_md = asyncio.run(run_claude_analysis(args.topic, args.mode, posts))
    except Exception as exc:
        analysis_md = heuristic_fallback_analysis(args.topic, args.mode, posts, reason=f"{type(exc).__name__}: {exc}")

    report_md = build_report_markdown(
        topic=args.topic,
        mode=args.mode,
        subreddit=args.subreddit,
        analysis_md=analysis_md,
        posts=posts,
    )
    report_path = write_report(args.topic, report_md)

    print(f"Raw data dump saved to: {REDDIT_DUMP_PATH}")
    print(f"Report saved to: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
