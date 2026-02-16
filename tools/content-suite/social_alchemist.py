#!/usr/bin/env python3
"""Social Media Alchemist engine.

Examples:
  python social_alchemist.py --input "My core idea..."
  python social_alchemist.py --input ./idea.txt
  python social_alchemist.py --input "https://example.com/post" --update_meta "LinkedIn is now prioritizing PDF carousels"
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
from urllib.parse import urlparse


_SCRIPT_DIR = Path(__file__).resolve().parent
PLAYBOOK_PATH = _SCRIPT_DIR / "playbook.json"
CAMPAIGNS_DIR = _SCRIPT_DIR / "campaigns"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Social Media Alchemist")
    parser.add_argument(
        "--input",
        required=True,
        help="Raw idea string, local file path, or URL.",
    )
    parser.add_argument(
        "--update_meta",
        default=None,
        help='Optional trend update, e.g. "LinkedIn is now prioritizing PDF carousels".',
    )
    return parser.parse_args()


def load_playbook() -> dict:
    if not PLAYBOOK_PATH.exists():
        raise FileNotFoundError(f"Missing playbook file: {PLAYBOOK_PATH}")
    return json.loads(PLAYBOOK_PATH.read_text(encoding="utf-8"))


def save_playbook(playbook: dict) -> None:
    playbook["last_updated"] = datetime.now().strftime("%Y-%m-%d")
    PLAYBOOK_PATH.write_text(json.dumps(playbook, indent=2, ensure_ascii=True), encoding="utf-8")


def _looks_like_url(value: str) -> bool:
    parsed = urlparse(value.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _read_input(raw_input: str) -> str:
    candidate = Path(raw_input)
    if candidate.exists() and candidate.is_file():
        return candidate.read_text(encoding="utf-8")
    if _looks_like_url(raw_input):
        import requests

        resp = requests.get(raw_input, timeout=30)
        resp.raise_for_status()
        html = resp.text
        text = re.sub(r"(?is)<script.*?>.*?</script>", " ", html)
        text = re.sub(r"(?is)<style.*?>.*?</style>", " ", text)
        text = re.sub(r"(?is)<[^>]+>", " ", text)
        return re.sub(r"\s+", " ", text).strip()
    return raw_input.strip()


def _slugify(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", value.strip()).strip("_") or "campaign"


def _topic_from_text(text: str, max_words: int = 6) -> str:
    words = re.findall(r"[A-Za-z0-9][A-Za-z0-9'-]*", text)
    if not words:
        return "core_idea"
    return "_".join(words[:max_words])


def _extract_json_object(text: str) -> dict | None:
    fenced = re.search(r"```json\s*(\{[\s\S]*\})\s*```", text)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # fallback: best-effort outermost braces
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None
    return None


def _extract_json_blocks(text: str) -> dict | None:
    block_match = re.search(r"```json\s*(\{[\s\S]*\})\s*```", text)
    if block_match:
        try:
            return json.loads(block_match.group(1))
        except json.JSONDecodeError:
            return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


async def _run_claude(prompt: str, max_turns: int = 1) -> str:
    from claude_agent_sdk import AssistantMessage, ClaudeAgentOptions, TextBlock, query

    # Remove CLAUDECODE guard so SDK can spawn a CLI subprocess
    os.environ.pop("CLAUDECODE", None)

    options = ClaudeAgentOptions(
        cwd=str(Path.cwd()),
        permission_mode="bypassPermissions",
        max_turns=max_turns,
    )
    chunks: list[str] = []
    async for msg in query(prompt=prompt, options=options):
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if isinstance(block, TextBlock):
                    chunks.append(block.text)
    output = "\n".join(c for c in chunks if c.strip()).strip()
    if not output:
        raise RuntimeError("Claude returned empty output.")
    return output


def update_playbook_with_meta(playbook: dict, update_meta: str) -> dict:
    prompt = f"""
You are maintaining a social media platform playbook.

Current playbook JSON:
```json
{json.dumps(playbook, ensure_ascii=True, indent=2)}
```

New market/meta update:
"{update_meta}"

Task:
Update the playbook intelligently.
- Keep current schema and platform keys.
- Update only relevant platform entries.
- Adjust best_practices with concrete, concise changes.
- Keep output as valid JSON only.
""".strip()

    try:
        raw = asyncio.run(_run_claude(prompt, max_turns=1))
        updated = _extract_json_object(raw)
        if isinstance(updated, dict) and "platforms" in updated:
            return updated
    except Exception:
        pass

    # Safe fallback if model update fails: append note to all matching platforms by name.
    text = update_meta.lower()
    platforms = playbook.get("platforms", {})
    matched = False
    for name, cfg in platforms.items():
        if name.lower().replace("_", " ") in text:
            cfg.setdefault("best_practices", [])
            cfg["best_practices"].append(f"Meta update note: {update_meta}")
            matched = True
    if not matched:
        playbook.setdefault("notes", [])
        playbook["notes"].append(update_meta)
    return playbook


def build_generation_prompt(core_input: str, playbook: dict) -> str:
    return f"""
You are a senior omni-channel social strategist.

Use this playbook as the governing strategy:
```json
{json.dumps(playbook, ensure_ascii=True, indent=2)}
```

Core input:
\"\"\"{core_input}\"\"\"

Instructions:
1) First, extract concise core value points (max 8 bullets).
2) Generate channel-specific assets:
   - x: hook-driven thread (1 main post + 5 replies)
   - threads: same core idea adapted to conversational tone
   - linkedin: choose either "bro-etry" style story OR professional insight post
   - instagram: image generator prompt + caption + 30 relevant hashtags
   - pinterest: image generator prompt + pin description + 30 relevant hashtags
   - tiktok: 60-second script with two columns: Visual and Audio/Speech
   - shorts: 60-second script with two columns: Visual and Audio/Speech
   - reels: 60-second script with two columns: Visual and Audio/Speech
   - reddit: discussion-starter post tuned for r/SaaS vibe
   - facebook: community-focused engagement post

Output format requirements:
- Return valid JSON only, matching this schema exactly:
{{
  "topic": "short topic label",
  "core_value_points": ["..."],
  "assets": {{
    "x": "text",
    "threads": "text",
    "linkedin": "text",
    "instagram": "text",
    "pinterest": "text",
    "tiktok": "text",
    "shorts": "text",
    "reels": "text",
    "reddit": "text",
    "facebook": "text"
  }}
}}
""".strip()


def fallback_assets(core_input: str) -> dict:
    topic = _topic_from_text(core_input)
    base = (
        "Core idea: " + core_input[:500]
        if core_input
        else "Core idea unavailable."
    )
    return {
        "topic": topic,
        "core_value_points": [
            "Define the target audience pain clearly.",
            "Offer a practical process instead of abstract advice.",
            "Provide one concrete example or proof point.",
            "Invite conversation with a focused question.",
        ],
        "assets": {
            "x": f"{base}\n\nMain: Why most teams fail at this (and what to do instead).\nReply 1-5: unpack problem -> framework -> example -> mistake -> CTA.",
            "threads": f"{base}\n\nConversational thread with softer tone and practical examples.",
            "linkedin": f"{base}\n\nA short professional insight post with lessons, outcomes, and a question.",
            "instagram": "Image prompt + caption + 30 hashtags placeholder.",
            "pinterest": "Pin prompt + description + 30 hashtags placeholder.",
            "tiktok": "Visual | Audio script for 60 seconds.",
            "shorts": "Visual | Audio script for 60 seconds.",
            "reels": "Visual | Audio script for 60 seconds.",
            "reddit": "r/SaaS discussion-starter framing the challenge and asking for feedback.",
            "facebook": "Community-focused post asking for real experiences and tips.",
        },
    }


def generate_assets(core_input: str, playbook: dict) -> dict:
    prompt = build_generation_prompt(core_input, playbook)
    try:
        raw = asyncio.run(_run_claude(prompt, max_turns=1))
        data = _extract_json_blocks(raw)
        if isinstance(data, dict) and isinstance(data.get("assets"), dict):
            return data
    except Exception:
        pass
    return fallback_assets(core_input)


def write_campaign(topic: str, payload: dict) -> Path:
    date_tag = datetime.now().strftime("%Y-%m-%d")
    folder = CAMPAIGNS_DIR / f"{date_tag}_{_slugify(topic)}"
    folder.mkdir(parents=True, exist_ok=True)

    # Summary files
    (folder / "core_value_points.txt").write_text(
        "\n".join(f"- {p}" for p in payload.get("core_value_points", [])),
        encoding="utf-8",
    )
    (folder / "campaign_meta.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=True),
        encoding="utf-8",
    )

    assets = payload.get("assets", {})
    for platform, content in assets.items():
        (folder / f"{platform}.txt").write_text(str(content).strip() + "\n", encoding="utf-8")
    return folder


def main() -> int:
    args = parse_args()
    if not PLAYBOOK_PATH.exists():
        print(f"Missing {PLAYBOOK_PATH}. Create it first.", file=sys.stderr)
        return 2

    try:
        playbook = load_playbook()
        if args.update_meta:
            playbook = update_playbook_with_meta(playbook, args.update_meta)
            save_playbook(playbook)

        source_text = _read_input(args.input)
        if not source_text:
            print("Input is empty after parsing.", file=sys.stderr)
            return 1

        generated = generate_assets(source_text, playbook)
        topic = generated.get("topic") or _topic_from_text(source_text)
        folder = write_campaign(topic, generated)
        print(f"Campaign assets saved to: {folder}")
        return 0
    except Exception as exc:
        print(f"Failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
