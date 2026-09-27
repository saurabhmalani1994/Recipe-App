"""Fetch/extract recipe data from the GitHub repos the owner listed.

github.com's HTML and REST API return 403 to this container, but `git clone` and
raw.githubusercontent.com work, so each repo is shallow-cloned (depth 1) into
/home/user/recipe-data/raw/<source>/repo/ and then scanned for recipe content. A clone that
already exists on disk is reused (resumable / idempotent).

Findings, one row per repo (see ingest/sources.md for the full writeup):
  - dspray95/open-recipe        -> source "github_openrecipe": a BBC Good Food scrapy
    spider whose checked-in sample output (src/recipe_builder/out.json) has 2 recipes.
  - suicideskyfall53/Cookdiary-Full-Version -> no recipe data. The repo is a link-farm /
    fake-release page (README pushes an external "download" link, plus a scheduled GitHub
    Action that fabricates commit activity). Flagged, not treated as a data source.
  - chadweimer/gomp             -> a real self-hosted recipe-manager app, but the repo only
    ships its Postgres/SQLite migrations (schema), no seed/sample recipe rows. No data.
  - samikshadubey23/recipe-generator -> source "github_recipegen": a Claude Skill (prompt
    template) for generating recipes, with 5 checked-in example outputs
    (example/*.md, Chinese, AI-generated, prose/markdown-table form). Extracted as low-value/
    synthetic; the README also pushes a suspicious external "release" download link like
    Cookdiary, so the repo itself is not treated as trustworthy, only the 5 example files are
    used.
"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from common import RAW_DATA_ROOT, SourceWriter, clean_list, clean_text

REPOS = {
    "github_openrecipe": "https://github.com/dspray95/open-recipe.git",
    "github_cookdiary": "https://github.com/suicideskyfall53/Cookdiary-Full-Version.git",
    "github_gomp": "https://github.com/chadweimer/gomp.git",
    "github_recipegen": "https://github.com/samikshadubey23/recipe-generator.git",
}


def clone(repo_key: str, url: str) -> Path:
    dest = RAW_DATA_ROOT / repo_key / "repo"
    if dest.exists() and any(dest.iterdir()):
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "clone", "--depth", "1", url, str(dest)],
        check=True,
        capture_output=True,
        timeout=120,
    )
    return dest


# ---- dspray95/open-recipe -------------------------------------------------

def parse_open_recipe_json(text: str) -> list[dict]:
    """Parse src/recipe_builder/out.json: a JSON list of {title, author, ingredients, method}."""
    data = json.loads(text)
    out = []
    for i, item in enumerate(data):
        title = clean_text(item.get("title"))
        if not title:
            continue
        out.append(
            {
                "id": f"github_openrecipe:{i}",
                "source": "github_openrecipe",
                "title": title,
                "ingredients": clean_list(item.get("ingredients") or []),
                "steps": clean_list(item.get("method") or []),
                "tags": clean_list([item["author"]]) if item.get("author") else [],
            }
        )
    return out


def fetch_open_recipe() -> dict:
    repo_dir = clone("github_openrecipe", REPOS["github_openrecipe"])
    out_json = repo_dir / "src" / "recipe_builder" / "out.json"
    with SourceWriter("github_openrecipe") as writer:
        if not out_json.exists():
            writer.drops.drop("out.json not found in repo")
        else:
            for rec in parse_open_recipe_json(out_json.read_text(encoding="utf-8")):
                writer.write(rec)
        return writer.summary()


# ---- samikshadubey23/recipe-generator --------------------------------------

_MD_ROW_RE = re.compile(r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$")


def parse_recipe_generator_md(text: str, filename: str) -> dict | None:
    """Best-effort extraction from one example/*.md file: a title heading, then markdown
    ingredient tables (食材 | 用量/规格 | 备注) and a "做法"/method section of numbered or
    bulleted steps. Synthetic/AI-generated content, kept low-priority."""
    lines = text.splitlines()
    title = filename.rsplit(".", 1)[0]
    for line in lines:
        if line.startswith("# "):
            title = clean_text(line[2:])
            break

    ingredients: list[str] = []
    steps: list[str] = []
    in_table = False
    in_steps = False
    for line in lines:
        s = line.strip()
        if s.startswith("## ") or (s.startswith("##") and not s.startswith("###")):
            # top-level section heading: switches mode; a "###" sub-heading (e.g. "主料")
            # stays inside whatever top-level section it is nested under.
            in_steps = "做法" in s or "步骤" in s or "烹饪" in s
            in_table = "食材" in s or "配料" in s
            continue
        if s.startswith("###"):
            continue
        if in_table and s.startswith("|"):
            m = _MD_ROW_RE.match(s)
            if m and "---" not in s and "食材" not in s:
                name, qty, note = (clean_text(g) for g in m.groups())
                if name:
                    ingredients.append(" ".join(x for x in (qty, name) if x))
        elif in_steps and (s.startswith("-") or s.startswith("*") or re.match(r"^\d+[.\)]", s)):
            step = clean_text(re.sub(r"^[-*]|^\d+[.\)]", "", s))
            if step:
                steps.append(step)

    if not ingredients and not steps:
        return None
    return {
        "id": f"github_recipegen:{filename}",
        "source": "github_recipegen",
        "title": title,
        "ingredients": ingredients,
        "steps": steps,
        "tags": ["synthetic", "ai-generated"],
    }


def fetch_recipe_generator() -> dict:
    repo_dir = clone("github_recipegen", REPOS["github_recipegen"])
    example_dir = repo_dir / "example"
    with SourceWriter("github_recipegen") as writer:
        if not example_dir.exists():
            writer.drops.drop("example/ dir not found in repo")
        else:
            for f in sorted(example_dir.glob("*.md")):
                rec = parse_recipe_generator_md(f.read_text(encoding="utf-8"), f.name)
                if rec is None:
                    writer.drops.drop("no ingredients/steps parsed")
                else:
                    writer.write(rec)
        return writer.summary()


# ---- the two repos with no recipe data -------------------------------------

def fetch_cookdiary() -> dict:
    clone("github_cookdiary", REPOS["github_cookdiary"])
    with SourceWriter("github_cookdiary") as writer:
        writer.drops.drop("repo has no recipe data (link-farm / fake-release repo)")
        return writer.summary()


def fetch_gomp() -> dict:
    clone("github_gomp", REPOS["github_gomp"])
    with SourceWriter("github_gomp") as writer:
        writer.drops.drop("repo is app code + DB schema only, no seed recipe data")
        return writer.summary()


def run() -> dict:
    return {
        "github_openrecipe": fetch_open_recipe(),
        "github_cookdiary": fetch_cookdiary(),
        "github_gomp": fetch_gomp(),
        "github_recipegen": fetch_recipe_generator(),
    }


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
