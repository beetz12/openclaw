#!/usr/bin/env python3
"""
visual_artist.py — Image generation agent for the Content Factory pipeline.

Generates images using Google Gemini 3 Pro Image Preview.
Supports direct prompts, draft-file extraction, and latest-draft auto-detection.

Usage:
    python visual_artist.py --prompt "a futuristic cityscape at sunset"
    python visual_artist.py --from-draft drafts/2026-02-15-ai-trends.md
    python visual_artist.py --from-latest --resolution 2K
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from io import BytesIO
from pathlib import Path

from factory_utils import get_logger, load_config, IMAGES_DIR, DRAFTS_DIR

logger = get_logger("visual_artist")

# ---------------------------------------------------------------------------
# Visual description extraction
# ---------------------------------------------------------------------------

_VISUAL_RE = re.compile(r"<!--\s*visual:\s*(.+?)\s*-->")


def extract_visual_prompt(draft_path: Path) -> str | None:
    """Extract a visual description from ``<!-- visual: DESCRIPTION -->`` in a markdown file."""
    text = draft_path.read_text(encoding="utf-8")
    match = _VISUAL_RE.search(text)
    return match.group(1).strip() if match else None


def find_latest_draft() -> Path | None:
    """Return the most recently modified ``.md`` file in the drafts directory."""
    if not DRAFTS_DIR.is_dir():
        return None
    md_files = sorted(DRAFTS_DIR.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
    return md_files[0] if md_files else None


# ---------------------------------------------------------------------------
# Slug helper
# ---------------------------------------------------------------------------


def _slugify(text: str, max_words: int = 5) -> str:
    """Turn the first few words of *text* into a filename-safe slug."""
    words = re.sub(r"[^a-z0-9\s]", "", text.lower()).split()[:max_words]
    return "-".join(words) if words else "image"


# ---------------------------------------------------------------------------
# Image generation
# ---------------------------------------------------------------------------


def generate_image(prompt: str, resolution: str = "1K", filename: str | None = None) -> Path:
    """Generate an image from *prompt* via Gemini and save it to ``images/``.

    Returns the absolute path of the saved PNG.
    """
    config = load_config()
    api_key = config.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in .env")

    # Lazy imports — only pay the cost after API key validation
    from google import genai
    from google.genai import types
    from PIL import Image as PILImage

    logger.info("Initializing Gemini client")
    client = genai.Client(api_key=api_key)

    # Build output path
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    if filename:
        out_name = filename if filename.endswith(".png") else f"{filename}.png"
    else:
        stamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
        slug = _slugify(prompt)
        out_name = f"{stamp}-{slug}.png"
    output_path = IMAGES_DIR / out_name

    logger.info("Generating image (resolution=%s): %s", resolution, prompt[:120])

    response = client.models.generate_content(
        model="gemini-3-pro-image-preview",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=types.ImageConfig(image_size=resolution),
        ),
    )

    # Parse response — look for inline image data
    image_saved = False
    for part in response.parts:
        if part.text is not None:
            logger.info("Model text: %s", part.text)
        elif part.inline_data is not None:
            image_data = part.inline_data.data
            if isinstance(image_data, str):
                import base64
                image_data = base64.b64decode(image_data)

            image = PILImage.open(BytesIO(image_data))

            # Ensure RGB mode for PNG output
            if image.mode == "RGBA":
                rgb_image = PILImage.new("RGB", image.size, (255, 255, 255))
                rgb_image.paste(image, mask=image.split()[3])
                rgb_image.save(str(output_path), "PNG")
            elif image.mode == "RGB":
                image.save(str(output_path), "PNG")
            else:
                image.convert("RGB").save(str(output_path), "PNG")

            image_saved = True
            logger.info("Image saved: %s", output_path.resolve())

    if not image_saved:
        raise RuntimeError("No image was generated in the API response")

    return output_path.resolve()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate images using Gemini 3 Pro Image Preview"
    )

    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--prompt", "-p",
        help="Direct text prompt for image generation",
    )
    source.add_argument(
        "--from-draft",
        metavar="PATH",
        help="Extract visual description from a draft markdown file",
    )
    source.add_argument(
        "--from-latest",
        action="store_true",
        help="Auto-find the most recent .md in drafts/ and extract visual description",
    )

    parser.add_argument(
        "--resolution", "-r",
        choices=["1K", "2K", "4K"],
        default="1K",
        help="Output resolution (default: 1K)",
    )
    parser.add_argument(
        "--filename", "-f",
        help="Override output filename (default: auto-generated timestamp)",
    )

    args = parser.parse_args()

    # Resolve prompt from the chosen source
    prompt: str | None = None

    if args.prompt:
        prompt = args.prompt

    elif args.from_draft:
        draft_path = Path(args.from_draft)
        if not draft_path.is_file():
            logger.error("Draft file not found: %s", draft_path)
            sys.exit(1)
        prompt = extract_visual_prompt(draft_path)
        if not prompt:
            logger.error(
                "No <!-- visual: DESCRIPTION --> marker found in %s. "
                "Add one to your draft, e.g.: <!-- visual: a serene mountain lake at dawn -->",
                draft_path,
            )
            sys.exit(1)
        logger.info("Extracted prompt from %s: %s", draft_path.name, prompt[:120])

    elif args.from_latest:
        draft_path = find_latest_draft()
        if not draft_path:
            logger.error("No .md files found in %s", DRAFTS_DIR)
            sys.exit(1)
        prompt = extract_visual_prompt(draft_path)
        if not prompt:
            logger.error(
                "No <!-- visual: DESCRIPTION --> marker found in latest draft %s. "
                "Add one to your draft, e.g.: <!-- visual: a serene mountain lake at dawn -->",
                draft_path.name,
            )
            sys.exit(1)
        logger.info("Using latest draft: %s", draft_path.name)
        logger.info("Extracted prompt: %s", prompt[:120])

    try:
        image_path = generate_image(prompt, resolution=args.resolution, filename=args.filename)
        # MEDIA line for OpenClaw compatibility (intentionally print, not logger)
        print(f"MEDIA: {image_path}")
    except ValueError as exc:
        logger.error("Configuration error: %s", exc)
        sys.exit(1)
    except RuntimeError as exc:
        logger.error("Generation failed: %s", exc)
        sys.exit(1)
    except Exception as exc:
        logger.error("Unexpected error: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
