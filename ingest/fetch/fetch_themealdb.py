"""Fetch TheMealDB's free tier (test API key "1"): a small, clean, structured recipe set.

No auth needed. The free tier has no "list everything" endpoint, so this iterates
search.php?f=<letter> for a-z and dedupes by idMeal (~790 recipes total, confirmed by a
reachability probe). Each meal already has category, area/cuisine, and up to 20
ingredient+measure pairs. Resumable: SourceWriter's existing-id check skips meals already
written; progress.json also records which letters have been fetched.
"""
from __future__ import annotations

import json
import string

import requests

from common import RAW_DATA_ROOT, SourceWriter, clean_list, clean_text

SOURCE = "themealdb"
BASE = "https://www.themealdb.com/api/json/v1/1/search.php?f={letter}"
TIMEOUT = 20


def parse_meal(meal: dict) -> dict:
    ingredients = []
    for i in range(1, 21):
        ing = clean_text(meal.get(f"strIngredient{i}"))
        measure = clean_text(meal.get(f"strMeasure{i}"))
        if not ing:
            continue
        line = f"{measure} {ing}".strip() if measure else ing
        ingredients.append(line)

    instructions = meal.get("strInstructions") or ""
    steps = clean_list([s for s in instructions.replace("\r\n", "\n").split("\n") if s.strip()])

    rec: dict = {
        "id": f"{SOURCE}:{meal['idMeal']}",
        "source": SOURCE,
        "title": clean_text(meal.get("strMeal")),
        "ingredients": ingredients,
        "steps": steps,
    }
    if meal.get("strSource"):
        rec["source_url"] = meal["strSource"]
    elif meal.get("strMealThumb"):
        pass
    if meal.get("strCategory"):
        rec["category"] = clean_text(meal["strCategory"])
    if meal.get("strArea"):
        rec["cuisine_label"] = clean_text(meal["strArea"])
    if meal.get("strMealThumb"):
        rec["image_url"] = meal["strMealThumb"]
    tags = []
    if meal.get("strTags"):
        tags.extend(t for t in meal["strTags"].split(",") if t.strip())
    if meal.get("strCountry"):
        tags.append(meal["strCountry"])
    if tags:
        rec["tags"] = clean_list(tags)
    return rec


def run() -> dict:
    with SourceWriter(SOURCE) as writer:
        progress = writer.load_progress()
        done_letters = set(progress.get("letters_done", []))
        for letter in string.ascii_lowercase:
            if letter in done_letters:
                continue
            try:
                r = requests.get(BASE.format(letter=letter), timeout=TIMEOUT)
                r.raise_for_status()
                meals = (r.json() or {}).get("meals") or []
            except requests.RequestException:
                writer.drops.drop(f"request failed for letter {letter}")
                continue
            for meal in meals:
                writer.write(parse_meal(meal))
            done_letters.add(letter)
            writer.save_progress({"letters_done": sorted(done_letters)})
        return writer.summary()


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
