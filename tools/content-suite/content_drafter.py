#!/usr/bin/env python3
"""
content_drafter.py — Synthesis agent that generates platform-specific content drafts.

Reads trend data from trends.json, uses claude-agent-sdk (local CLI auth)
to generate tailored content for each platform, and writes markdown drafts
to the drafts/ directory.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import os

from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    ResultMessage,
    ClaudeSDKError,
    CLINotFoundError,
    ProcessError,
)

from factory_utils import (
    get_logger,
    PLATFORMS,
    TRENDS_FILE,
    DRAFTS_DIR,
    atomic_write_text,
)

log = get_logger("content_drafter")

# ---------------------------------------------------------------------------
# Platform-specific prompt templates
# ---------------------------------------------------------------------------

PLATFORM_PROMPTS: dict[str, str] = {
    "linkedin": (
        "Write a LinkedIn thought leadership post. Start with a compelling hook. "
        "Share a unique insight about {topic}. Include a clear call-to-action. "
        "1000-2000 characters. Professional but conversational tone."
    ),
    "youtube": (
        "Write a YouTube video script. Include: attention-grabbing intro (30 sec), "
        "3-5 educational sections with transitions, actionable takeaways, "
        "outro with CTA. Format with timestamps and section headers."
    ),
    "youtube_shorts": (
        "Write a 60-second YouTube Shorts script. Start with an irresistible hook "
        "in the first 3 seconds. One key insight. Fast-paced, visual."
    ),
    "x": (
        "Write a Twitter/X thread of 3-5 tweets. First tweet must be a strong hook. "
        "Each tweet under 280 chars. End with CTA."
    ),
    "threads": (
        "Write a Threads post. Conversational, authentic tone. 2-4 paragraphs. "
        "Start with a relatable observation."
    ),
    "instagram": (
        "Write an Instagram caption. Hook in first line (before 'more'). "
        "Include relevant hashtags (15-20). Add a visual description for the "
        "accompanying image."
    ),
    "tiktok": (
        "Write a TikTok script (60 sec max). Hook in first 3 seconds. "
        "Fast cuts, visual instructions in brackets. Educational but entertaining."
    ),
    "facebook": (
        "Write a Facebook post that encourages discussion. Ask a question. "
        "Share a story or insight. Community-focused tone."
    ),
    "reddit": (
        "Write a Reddit post for r/artificial or r/MachineLearning. "
        "Detailed, technical, well-formatted with markdown. "
        "Include code examples if relevant."
    ),
    "pinterest": (
        "Write a Pinterest pin description. SEO-optimized with keywords. "
        "Include visual styling notes."
    ),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def slugify(text: str) -> str:
    """Convert text to a filename-safe slug."""
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug[:60].strip("-")


def load_trends() -> list[dict]:
    """Load and validate trends.json, returning the list of trends."""
    if not TRENDS_FILE.exists():
        log.error("trends.json not found at %s", TRENDS_FILE)
        sys.exit(1)

    data = json.loads(TRENDS_FILE.read_text(encoding="utf-8"))

    trends = data if isinstance(data, list) else data.get("trends", [])
    if not trends:
        log.error("trends.json is empty — run trend_scout.py first")
        sys.exit(1)

    log.info("Loaded %d trends from %s", len(trends), TRENDS_FILE)
    return trends


def build_draft_markdown(
    topic_title: str,
    platform: str,
    content: str,
    source_url: str,
) -> str:
    """Assemble the final markdown draft with frontmatter."""
    now = datetime.now(timezone.utc).isoformat()
    return (
        f"---\n"
        f"topic: {topic_title}\n"
        f"platform: {platform}\n"
        f"generated_at: {now}\n"
        f"source_trend: {source_url}\n"
        f"---\n\n"
        f"# {topic_title} — {platform.replace('_', ' ').title()} Draft\n\n"
        f"{content}\n"
    )


def draft_filepath(platform: str, topic_title: str) -> Path:
    """Return the output path: drafts/YYYY-MM-DD_Topic-Slug_platform.md"""
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slug = slugify(topic_title)
    return DRAFTS_DIR / f"{date_str}_{slug}_{platform}.md"


# ---------------------------------------------------------------------------
# SDK interaction
# ---------------------------------------------------------------------------


def _ensure_nestable() -> None:
    """Remove the CLAUDECODE guard so the SDK can spawn a CLI subprocess."""
    os.environ.pop("CLAUDECODE", None)


def _sdk_options() -> ClaudeAgentOptions:
    """Build ClaudeAgentOptions with sensible defaults for content generation."""
    _ensure_nestable()
    return ClaudeAgentOptions(
        permission_mode="bypassPermissions",
        max_turns=1,
        max_budget_usd=0.50,
    )


async def call_claude(prompt: str) -> tuple[str, float | None, int | None]:
    """Send a prompt to Claude via the Agent SDK and return (text, cost, duration_ms)."""
    result_text: list[str] = []
    cost: float | None = None
    duration_ms: int | None = None

    try:
        async with ClaudeSDKClient(options=_sdk_options()) as client:
            await client.query(prompt)
            async for msg in client.receive_messages():
                if isinstance(msg, AssistantMessage):
                    for block in msg.content:
                        if isinstance(block, TextBlock):
                            result_text.append(block.text)
                elif isinstance(msg, ResultMessage):
                    cost = msg.total_cost_usd
                    duration_ms = msg.duration_ms
                    break
    except CLINotFoundError:
        log.error("Claude CLI not found — install with: npm install -g @anthropic-ai/claude-code")
        sys.exit(1)
    except ProcessError as exc:
        log.error("Claude CLI process failed (exit %s): %s", exc.exit_code, exc)
        sys.exit(1)
    except ClaudeSDKError as exc:
        log.error("Claude SDK error: %s", exc)
        sys.exit(1)

    return "\n".join(result_text), cost, duration_ms


async def pick_topic(trends: list[dict]) -> tuple[int, str]:
    """Ask Claude to pick the best trend topic and return (index, reasoning)."""
    summary_lines = []
    for i, trend in enumerate(trends):
        title = trend.get("title", trend.get("topic", f"Trend {i}"))
        desc = trend.get("description", trend.get("summary", ""))
        summary_lines.append(f"{i}. {title}: {desc[:200]}")

    prompt = (
        "You are a content strategist. Below are trending topics gathered today. "
        "Pick the ONE topic with the highest content potential — consider timeliness, "
        "audience interest, and how much unique insight can be added.\n\n"
        + "\n".join(summary_lines)
        + "\n\nRespond with ONLY a JSON object: "
        '{"index": <number>, "reason": "<one sentence>"}'
    )

    text, cost, _ = await call_claude(prompt)
    log.debug("Topic selection cost: $%.4f", cost or 0)

    # Parse the JSON from Claude's response
    json_match = re.search(r"\{[^}]+\}", text)
    if not json_match:
        log.warning("Could not parse topic selection response, defaulting to index 0")
        return 0, "Default selection — could not parse agent response"

    result = json.loads(json_match.group())
    idx = int(result["index"])
    reason = result.get("reason", "No reason provided")

    if idx < 0 or idx >= len(trends):
        log.warning("Agent picked out-of-range index %d, clamping to 0", idx)
        return 0, reason

    return idx, reason


async def generate_draft(
    platform: str,
    topic_title: str,
    topic_description: str,
    source_url: str,
) -> Path:
    """Generate a content draft for a single platform and write it to disk."""
    platform_info = PLATFORMS[platform]
    template = PLATFORM_PROMPTS[platform]

    max_chars_note = ""
    if platform_info["max_chars"]:
        max_chars_note = f" Keep the content under {platform_info['max_chars']} characters."

    prompt = (
        f"You are a world-class content creator.\n\n"
        f"Topic: {topic_title}\n"
        f"Context: {topic_description}\n"
        f"Platform: {platform}\n"
        f"Style: {platform_info['style']}\n\n"
        f"{template.format(topic=topic_title)}\n\n"
        f"{max_chars_note}\n\n"
        f"After the main content, add on its own line:\n"
        f"<!-- visual: [A detailed description of an ideal visual/image to accompany this content] -->\n\n"
        f"Output ONLY the content — no preamble or explanation."
    )

    text, cost, duration_ms = await call_claude(prompt)

    log.info(
        "Generated %s draft: %d chars | cost=$%.4f | duration=%dms",
        platform,
        len(text),
        cost or 0,
        duration_ms or 0,
    )

    # Ensure the visual marker exists
    if "<!-- visual:" not in text:
        text += (
            "\n\n<!-- visual: A professional, modern graphic illustrating "
            f"the key concept of {topic_title} for {platform} -->"
        )

    md = build_draft_markdown(topic_title, platform, text, source_url)
    out_path = draft_filepath(platform, topic_title)
    atomic_write_text(out_path, md)
    log.info("Saved draft to %s", out_path)
    return out_path


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def run(args: argparse.Namespace) -> None:
    """Main async entry point."""
    trends = load_trends()

    # Determine topic
    if args.topic is not None:
        if args.topic < 0 or args.topic >= len(trends):
            log.error(
                "Topic index %d out of range (0-%d)", args.topic, len(trends) - 1
            )
            sys.exit(1)
        topic_idx = args.topic
        log.info("Using user-specified topic index %d", topic_idx)
    else:
        topic_idx, reason = await pick_topic(trends)
        log.info("Agent picked topic %d: %s", topic_idx, reason)

    trend = trends[topic_idx]
    topic_title = trend.get("title", trend.get("topic", f"Trend {topic_idx}"))
    topic_desc = trend.get("description", trend.get("summary", ""))
    source_url = trend.get("url", trend.get("source", ""))

    log.info("Topic: %s", topic_title)

    # Determine platforms
    if args.all:
        platforms = list(PLATFORMS.keys())
        log.info("Generating drafts for ALL %d platforms", len(platforms))
    else:
        if args.type not in PLATFORMS:
            log.error(
                "Unknown platform '%s'. Available: %s",
                args.type,
                ", ".join(PLATFORMS.keys()),
            )
            sys.exit(1)
        platforms = [args.type]

    # Generate drafts
    DRAFTS_DIR.mkdir(parents=True, exist_ok=True)

    output_paths: list[Path] = []
    for platform in platforms:
        path = await generate_draft(platform, topic_title, topic_desc, source_url)
        output_paths.append(path)

    log.info(
        "Done — generated %d draft(s): %s",
        len(output_paths),
        ", ".join(p.name for p in output_paths),
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate platform-specific content drafts from trending topics.",
    )
    parser.add_argument(
        "--type",
        default="linkedin",
        help="Platform name from registry (default: linkedin). Options: "
        + ", ".join(PLATFORMS.keys()),
    )
    parser.add_argument(
        "--topic",
        type=int,
        default=None,
        help="Zero-based index into trends.json. If omitted, the agent picks the best topic.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Generate content for ALL platforms from one topic.",
    )
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
