"""Shared helpers for source fetchers.

Every fetcher writes JSONL matching schema/raw_recipe.md into
/home/user/recipe-data/raw/<source>/recipes.jsonl, plus a progress.json sidecar so a later
run can resume instead of re-fetching.
"""
from __future__ import annotations

import html
import json
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

RAW_DATA_ROOT = Path(os.environ.get("RECIPE_RAW_DATA_ROOT", "/home/user/recipe-data/raw"))

_TAG_RE = re.compile(r"<[^>]+>")


def clean_text(s: str | None) -> str:
    """Decode HTML entities and strip tags; collapse whitespace. Presentation noise only."""
    if not s:
        return ""
    s = _TAG_RE.sub(" ", s)
    s = html.unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def clean_list(items: Iterable[Any]) -> list[str]:
    out = []
    for it in items:
        t = clean_text(str(it)) if it is not None else ""
        if t:
            out.append(t)
    return out


@dataclass
class DropCounter:
    """Counts why records were dropped/skipped, per rule 11 (no silent drops)."""

    reasons: dict[str, int] = field(default_factory=dict)

    def drop(self, reason: str, n: int = 1) -> None:
        self.reasons[reason] = self.reasons.get(reason, 0) + n

    def as_dict(self) -> dict[str, int]:
        return dict(self.reasons)


class SourceWriter:
    """Appends validated raw-recipe JSONL records, resumable across runs.

    On construction it reads any existing recipes.jsonl for this source and loads the set of
    ids already written, so calling write() again with the same id is a no-op (counted as a
    dup-skip) instead of a duplicate line.
    """

    REQUIRED = ("id", "source", "title", "ingredients", "steps")

    def __init__(self, source: str, out_root: Path = RAW_DATA_ROOT):
        self.source = source
        self.dir = out_root / source
        self.dir.mkdir(parents=True, exist_ok=True)
        self.jsonl_path = self.dir / "recipes.jsonl"
        self.progress_path = self.dir / "progress.json"
        self.drops = DropCounter()
        self.seen_ids: set[str] = set()
        self.written = 0
        if self.jsonl_path.exists():
            with self.jsonl_path.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                        self.seen_ids.add(rec["id"])
                        self.written += 1
                    except Exception:
                        continue
        self._fh = self.jsonl_path.open("a", encoding="utf-8")

    def load_progress(self) -> dict[str, Any]:
        if self.progress_path.exists():
            try:
                return json.loads(self.progress_path.read_text())
            except Exception:
                return {}
        return {}

    def save_progress(self, state: dict[str, Any]) -> None:
        self.progress_path.write_text(json.dumps(state, indent=2))

    def write(self, rec: dict[str, Any]) -> bool:
        """Validate and append one record. Returns True if written, False if dropped/dup."""
        for k in self.REQUIRED:
            if k not in rec:
                self.drops.drop(f"missing field: {k}")
                return False
        if not rec["ingredients"] and not rec["steps"]:
            self.drops.drop("empty ingredients and steps")
            return False
        rid = rec["id"]
        if rid in self.seen_ids:
            self.drops.drop("duplicate id")
            return False
        self.seen_ids.add(rid)
        self._fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        self._fh.flush()
        self.written += 1
        return True

    def close(self) -> None:
        self._fh.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def summary(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "written": self.written,
            "drops": self.drops.as_dict(),
            "path": str(self.jsonl_path),
        }


class RateLimiter:
    """Sleeps as needed to keep calls to at most `per_second` per second."""

    def __init__(self, per_second: float = 1.0):
        self.min_interval = 1.0 / per_second if per_second > 0 else 0.0
        self._last = 0.0

    def wait(self) -> None:
        now = time.monotonic()
        delta = now - self._last
        if delta < self.min_interval:
            time.sleep(self.min_interval - delta)
        self._last = time.monotonic()
