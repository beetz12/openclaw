#!/usr/bin/env python3
"""YouTube Strategist Agent.

Examples:
  python youtube_strategist.py --topic "AI Agents"
  python youtube_strategist.py --topic "Ecommerce SEO" --channel_id "UC_x5XG1OV2P6uZZ5FSM9Ttw"
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


_SCRIPT_DIR = Path(__file__).resolve().parent
LOG_CSV_PATH = _SCRIPT_DIR / "logs" / "youtube_data.csv"
STRATEGY_DIR = _SCRIPT_DIR / "strategies"
MAX_SEARCH_RESULTS = 100


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="YouTube Strategist")
    parser.add_argument("--topic", required=True, help='Niche to research, e.g. "AI Agents".')
    parser.add_argument(
        "--channel_id",
        default=None,
        help="Optional competitor channel ID to analyze directly.",
    )
    return parser.parse_args()


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def youtube_client() -> Any:
    from googleapiclient.discovery import build

    api_key = require_env("YOUTUBE_API_KEY")
    return build("youtube", "v3", developerKey=api_key)


def to_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_duration_seconds(iso_duration: str) -> int:
    # Supports YouTube ISO 8601 format like PT1H2M3S, PT8M, PT55S
    pattern = re.compile(
        r"^P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$"
    )
    match = pattern.match(iso_duration or "")
    if not match:
        return 0
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def format_duration(seconds: int) -> str:
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def search_video_ids(yt: Any, topic: str, channel_id: str | None, published_after: str) -> list[str]:
    ids: list[str] = []
    page_token: str | None = None

    while len(ids) < MAX_SEARCH_RESULTS:
        req = yt.search().list(
            part="id,snippet",
            type="video",
            maxResults=min(50, MAX_SEARCH_RESULTS - len(ids)),
            pageToken=page_token,
            publishedAfter=published_after,
            order="viewCount" if channel_id else "relevance",
            channelId=channel_id,
            q=topic if not channel_id else None,
        )
        resp = req.execute()
        for item in resp.get("items", []):
            video_id = (item.get("id") or {}).get("videoId")
            if video_id:
                ids.append(video_id)
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return ids


def fetch_videos(yt: Any, video_ids: list[str]) -> list[dict[str, Any]]:
    videos: list[dict[str, Any]] = []
    for i in range(0, len(video_ids), 50):
        chunk = video_ids[i : i + 50]
        req = yt.videos().list(part="snippet,statistics,contentDetails", id=",".join(chunk))
        resp = req.execute()
        videos.extend(resp.get("items", []))
    return videos


def fetch_channels(yt: Any, channel_ids: list[str]) -> dict[str, dict[str, Any]]:
    channel_map: dict[str, dict[str, Any]] = {}
    uniq = list(dict.fromkeys(channel_ids))
    for i in range(0, len(uniq), 50):
        chunk = uniq[i : i + 50]
        req = yt.channels().list(part="statistics,snippet", id=",".join(chunk))
        resp = req.execute()
        for item in resp.get("items", []):
            channel_map[item["id"]] = item
    return channel_map


def compute_breakouts(videos: list[dict[str, Any]], channels: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for v in videos:
        vid = v.get("id")
        snippet = v.get("snippet") or {}
        stats = v.get("statistics") or {}
        details = v.get("contentDetails") or {}
        cid = snippet.get("channelId")
        ch = channels.get(cid or "", {})
        ch_stats = ch.get("statistics") or {}
        subs = int(ch_stats.get("subscriberCount") or 0)
        views = int(stats.get("viewCount") or 0)

        if subs <= 0:
            multiplier = None
        else:
            multiplier = round(views / subs, 4)

        duration_iso = details.get("duration") or ""
        duration_seconds = parse_duration_seconds(duration_iso)
        channel_title = snippet.get("channelTitle") or (ch.get("snippet") or {}).get("title")
        row = {
            "video_id": vid,
            "title": snippet.get("title"),
            "published_at": snippet.get("publishedAt"),
            "channel_id": cid,
            "channel_title": channel_title,
            "channel_subscribers": subs,
            "view_count": views,
            "like_count": int(stats.get("likeCount") or 0),
            "comment_count": int(stats.get("commentCount") or 0),
            "duration_iso": duration_iso,
            "duration_seconds": duration_seconds,
            "duration_hms": format_duration(duration_seconds),
            "multiplier": multiplier,
            "video_url": f"https://www.youtube.com/watch?v={vid}",
            "thumbnail_url": (
                ((snippet.get("thumbnails") or {}).get("maxres") or {}).get("url")
                or ((snippet.get("thumbnails") or {}).get("high") or {}).get("url")
                or ((snippet.get("thumbnails") or {}).get("medium") or {}).get("url")
                or ((snippet.get("thumbnails") or {}).get("default") or {}).get("url")
            ),
        }
        rows.append(row)
    return rows


def breakout_top5(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    filtered = [r for r in rows if isinstance(r.get("multiplier"), float) and r["multiplier"] >= 3.0]
    filtered.sort(key=lambda r: r["multiplier"], reverse=True)
    return filtered[:5]


def build_prompt(topic: str, channel_id: str | None, top5: list[dict[str, Any]]) -> str:
    instruction = f"""
You are a YouTube strategist and story psychologist.

Context:
- Topic: {topic}
- Competitor Channel Focus: {channel_id or "No (topic-wide)"}
- Videos provided are statistical outliers (views/subscribers >= 3).

Task 1 (Analysis):
"These videos are statistical outliers. Analyze the psychology of their titles and the promise of their thumbnails. Why did they click?"

Task 2 (Production):
Based on your analysis, generate 3 original video concepts for me.
For the best concept, provide:
1) Title: 3 click-optimized variations
2) Hook: first 60 seconds word-for-word
3) Structure: bulleted outline for the rest of the video

Output format:
- Outlier Breakdown
- Why They Clicked
- Three Original Concepts
- Best Concept Package
""".strip()

    payload = json.dumps(
        [
            {
                "title": r["title"],
                "thumbnail_url": r["thumbnail_url"],
                "duration": r["duration_hms"],
                "multiplier": r["multiplier"],
                "view_count": r["view_count"],
                "channel_subscribers": r["channel_subscribers"],
                "video_url": r["video_url"],
            }
            for r in top5
        ],
        ensure_ascii=True,
        indent=2,
    )
    return f"{instruction}\n\nOutliers:\n```json\n{payload}\n```"


async def claude_strategy(topic: str, channel_id: str | None, top5: list[dict[str, Any]]) -> str:
    from claude_agent_sdk import AssistantMessage, ClaudeAgentOptions, TextBlock, query

    # Remove CLAUDECODE guard so SDK can spawn a CLI subprocess
    os.environ.pop("CLAUDECODE", None)

    options = ClaudeAgentOptions(
        cwd=str(Path.cwd()),
        permission_mode="bypassPermissions",
        max_turns=1,
    )

    prompt = build_prompt(topic, channel_id, top5)
    chunks: list[str] = []
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    chunks.append(block.text)
    text = "\n".join(c for c in chunks if c.strip()).strip()
    if not text:
        raise RuntimeError("No text returned by Claude")
    return text


def fallback_strategy(top5: list[dict[str, Any]], reason: str) -> str:
    lines = [
        "## Outlier Breakdown",
        f"Claude analysis unavailable (`{reason}`). Heuristic summary below.",
        "",
        "## Why They Clicked",
    ]
    for i, row in enumerate(top5, start=1):
        lines.append(
            f"{i}. [{row['title']}]({row['video_url']})"
            f" - multiplier: {row['multiplier']}x, duration: {row['duration_hms']}"
        )
    lines.extend(
        [
            "",
            "## Three Original Concepts",
            "1. Contrarian myth-busting angle in your niche",
            "2. Before/after transformation with specific steps",
            "3. Tactical teardown of a successful case",
            "",
            "## Best Concept Package",
            "Title variations:",
            "- The [Niche] Playbook Nobody Explains Clearly",
            "- I Tested [Tactic] for 30 Days: What Actually Works",
            "- Stop Doing [Common Mistake] in [Niche]",
            "",
            "Hook (first 60s):",
            "Start with the painful misconception, reveal a surprising data point, then promise a 3-step framework.",
            "",
            "Structure:",
            "- Context and stakes",
            "- Step-by-step framework",
            "- Real-world example",
            "- Common pitfalls",
            "- CTA with next action",
        ]
    )
    return "\n".join(lines)


def write_csv(rows: list[dict[str, Any]]) -> None:
    import pandas as pd

    LOG_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows)
    df.to_csv(LOG_CSV_PATH, index=False)


def slugify(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", value.strip()).strip("_") or "topic"


def write_strategy(topic: str, body: str, top5: list[dict[str, Any]]) -> Path:
    STRATEGY_DIR.mkdir(parents=True, exist_ok=True)
    date_tag = datetime.now().strftime("%Y-%m-%d")
    path = STRATEGY_DIR / f"{date_tag}_{slugify(topic)}.md"

    header = [
        f"# YouTube Strategy Report: {topic}",
        "",
        f"- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- Outliers Analyzed: {len(top5)}",
        "",
        "## Top Outlier Links",
    ]
    for i, row in enumerate(top5, start=1):
        header.append(f"{i}. [{row['title']}]({row['video_url']}) - {row['multiplier']}x")
    header.append("")

    path.write_text("\n".join(header) + body.strip() + "\n", encoding="utf-8")
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
        yt = youtube_client()
        published_after = to_iso(datetime.now(tz=timezone.utc) - timedelta(days=90))
        video_ids = search_video_ids(yt, args.topic, args.channel_id, published_after)
        if not video_ids:
            print("No videos found for the selected topic/channel in the last 90 days.", file=sys.stderr)
            return 1

        videos = fetch_videos(yt, video_ids)
        channel_ids = [v.get("snippet", {}).get("channelId") for v in videos if v.get("snippet", {}).get("channelId")]
        channels = fetch_channels(yt, channel_ids)
        rows = compute_breakouts(videos, channels)
        write_csv(rows)

        top5 = breakout_top5(rows)
        if not top5:
            print("No breakout outliers (multiplier >= 3) found.", file=sys.stderr)
            strategy = fallback_strategy([], reason="No qualifying outliers")
            strategy_path = write_strategy(args.topic, strategy, [])
            print(f"Raw data saved to: {LOG_CSV_PATH}")
            print(f"Strategy saved to: {strategy_path}")
            return 0

        try:
            strategy = asyncio.run(claude_strategy(args.topic, args.channel_id, top5))
        except Exception as exc:
            strategy = fallback_strategy(top5, reason=f"{type(exc).__name__}: {exc}")

        strategy_path = write_strategy(args.topic, strategy, top5)
        print(f"Raw data saved to: {LOG_CSV_PATH}")
        print(f"Strategy saved to: {strategy_path}")
        return 0

    except Exception as exc:
        print(f"Failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
