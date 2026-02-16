"""
factory_utils.py — Shared infrastructure for the Content Factory pipeline.

Provides logging, config loading, platform registry, retry logic,
and atomic file writes used by all pipeline stages.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Callable, TypeVar

from dotenv import dotenv_values

# ---------------------------------------------------------------------------
# Path constants
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).parent
TRENDS_FILE = PROJECT_ROOT / "trends.json"
DRAFTS_DIR = PROJECT_ROOT / "drafts"
IMAGES_DIR = PROJECT_ROOT / "images"

# ---------------------------------------------------------------------------
# Platform registry
# ---------------------------------------------------------------------------

PLATFORMS: dict[str, dict[str, Any]] = {
    "linkedin":       {"type": "long",  "max_chars": 3000,  "style": "thought_leadership"},
    "youtube":        {"type": "long",  "max_chars": None,  "style": "educational_script"},
    "youtube_shorts": {"type": "short", "max_chars": 500,   "style": "hook_educational"},
    "x":              {"type": "short", "max_chars": 280,   "style": "punchy_insight"},
    "threads":        {"type": "short", "max_chars": 500,   "style": "conversational"},
    "instagram":      {"type": "short", "max_chars": 2200,  "style": "visual_caption"},
    "tiktok":         {"type": "short", "max_chars": 500,   "style": "hook_educational"},
    "facebook":       {"type": "long",  "max_chars": 5000,  "style": "community_engagement"},
    "reddit":         {"type": "long",  "max_chars": 10000, "style": "detailed_technical"},
    "pinterest":      {"type": "short", "max_chars": 500,   "style": "visual_description"},
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

_LOG_FORMAT = "%(asctime)s | %(name)s | %(levelname)s | %(message)s"


def get_logger(name: str) -> logging.Logger:
    """Return a logger with console (INFO) and rotating file (DEBUG) handlers."""
    logger = logging.getLogger(name)

    if logger.handlers:
        return logger  # already configured

    logger.setLevel(logging.DEBUG)

    # Console handler — INFO
    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    console.setFormatter(logging.Formatter(_LOG_FORMAT))
    logger.addHandler(console)

    # File handler — DEBUG, rotating 5 MB x 3 backups
    log_path = PROJECT_ROOT / "factory.log"
    file_handler = RotatingFileHandler(
        log_path, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(_LOG_FORMAT))
    logger.addHandler(file_handler)

    return logger


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

_ENV_KEYS = ("BRAVE_API_KEY", "GROK_API_KEY", "GEMINI_API_KEY")

_logger = get_logger("factory_utils")


def load_config() -> dict[str, str | None]:
    """Load .env and return a dict of third-party API keys.

    Warns (but does not crash) when keys are missing or empty.
    """
    env_path = PROJECT_ROOT / ".env"
    raw = dotenv_values(env_path) if env_path.exists() else {}

    config: dict[str, str | None] = {}
    for key in _ENV_KEYS:
        value = raw.get(key) or os.environ.get(key)
        config[key] = value if value else None
        if not value:
            _logger.warning("Config key %s is not set — some features may be unavailable", key)

    return config


# ---------------------------------------------------------------------------
# Retry helper
# ---------------------------------------------------------------------------

T = TypeVar("T")


async def with_retry(
    fn: Callable[..., Any],
    *,
    max_retries: int = 3,
    initial_delay: float = 1.0,
) -> Any:
    """Call *fn* (async or sync) with exponential-backoff retry.

    Raises the last exception if all retries are exhausted.
    """
    delay = initial_delay
    last_exc: BaseException | None = None

    for attempt in range(1, max_retries + 1):
        try:
            result = fn()
            if asyncio.iscoroutine(result):
                return await result
            return result
        except Exception as exc:
            last_exc = exc
            if attempt < max_retries:
                _logger.warning(
                    "Retry %d/%d for %s after error: %s",
                    attempt, max_retries, getattr(fn, "__name__", fn), exc,
                )
                await asyncio.sleep(delay)
                delay *= 2
            else:
                _logger.error(
                    "All %d retries exhausted for %s: %s",
                    max_retries, getattr(fn, "__name__", fn), exc,
                )

    raise last_exc  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Atomic file writes
# ---------------------------------------------------------------------------


def atomic_write_json(filepath: str | Path, data: Any) -> None:
    """Write *data* as JSON to *filepath* atomically via temp-file + rename."""
    filepath = Path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(dir=filepath.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, filepath)
    except BaseException:
        os.unlink(tmp_path)
        raise


def atomic_write_text(filepath: str | Path, text: str) -> None:
    """Write *text* to *filepath* atomically via temp-file + rename."""
    filepath = Path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(dir=filepath.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp_path, filepath)
    except BaseException:
        os.unlink(tmp_path)
        raise
