"""pytest for each fetcher's parse function, against small saved fixtures.

Run from ingest/fetch/: pytest test_fetchers.py -v
"""
from __future__ import annotations

import csv
import io
import json
import re
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


# ---- recipenlg -------------------------------------------------------------

def test_recipenlg_parse_row():
    from fetch_recipenlg import parse_row

    with (FIXTURES / "recipenlg_sample.csv").open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 2

    rec0 = parse_row(rows[0])
    assert rec0["id"] == "recipenlg:0"
    assert rec0["source"] == "recipenlg"
    assert rec0["title"] == "No-Bake Nut Cookies"
    assert rec0["ingredients"] == [
        "1 c. firmly packed brown sugar",
        "1/2 c. evaporated milk",
    ]
    assert rec0["steps"][0].startswith("In a heavy 2-quart saucepan")
    assert rec0["source_url"].startswith("http://www.cookbooks.com")
    assert "brown sugar" in rec0["tags"]

    rec1 = parse_row(rows[1])
    assert rec1["title"] == "Jewell Ball'S Chicken"
    assert len(rec1["ingredients"]) == 2


def test_recipenlg_parse_row_no_title_drops():
    from fetch_recipenlg import parse_row

    assert parse_row({"": "9", "title": "", "ingredients": "[]", "directions": "[]"}) is None


# ---- github repos -----------------------------------------------------------

def test_open_recipe_json():
    from fetch_github_repos import parse_open_recipe_json

    sample = json.dumps(
        [
            {
                "title": "Test Bake",
                "author": "Jane Doe",
                "ingredients": ["1 cup flour", "2 eggs"],
                "method": ["Mix.", "Bake."],
            }
        ]
    )
    recs = parse_open_recipe_json(sample)
    assert len(recs) == 1
    assert recs[0]["id"] == "github_openrecipe:0"
    assert recs[0]["title"] == "Test Bake"
    assert recs[0]["ingredients"] == ["1 cup flour", "2 eggs"]
    assert recs[0]["steps"] == ["Mix.", "Bake."]


def test_recipe_generator_md():
    from fetch_github_repos import parse_recipe_generator_md

    md = (
        "# Test Dish\n\n"
        "## 食材清单\n\n"
        "### 主料\n"
        "| 食材 | 规格 | 备注 |\n"
        "|------|------|------|\n"
        "| 鲈鱼 | 1条 | 新鲜 |\n\n"
        "## 做法\n"
        "1. 洗净鱼身。\n"
        "2. 大火蒸制。\n"
    )
    rec = parse_recipe_generator_md(md, "test.md")
    assert rec is not None
    assert rec["title"] == "Test Dish"
    assert rec["source"] == "github_recipegen"
    assert any("鲈鱼" in i for i in rec["ingredients"])
    assert rec["steps"] == ["洗净鱼身。", "大火蒸制。"]


def test_recipe_generator_md_empty_drops():
    from fetch_github_repos import parse_recipe_generator_md

    assert parse_recipe_generator_md("# Just a title\n\nSome prose.\n", "x.md") is None


# ---- bbcgoodfood ------------------------------------------------------------

def test_bbcgoodfood_parse_recipe_page():
    from fetch_bbcgoodfood import parse_recipe_page

    html_text = (FIXTURES / "bbcgoodfood_sample.html").read_text(encoding="utf-8")
    rec = parse_recipe_page(html_text, "https://www.bbcgoodfood.com/recipes/panettone-2")
    assert rec is not None
    assert rec["source"] == "bbcgoodfood"
    assert rec["id"] == "bbcgoodfood:panettone-2"
    assert rec["title"] == "Panettone"
    assert len(rec["ingredients"]) > 5
    assert any("yeast" in i.lower() for i in rec["ingredients"])
    assert len(rec["steps"]) > 0
    assert rec["yield_text"] == "Serves 8"
    assert rec["total_time_min"] == 110
    assert rec["prep_time_min"] == 60
    assert rec["cook_time_min"] == 50


def test_bbcgoodfood_no_ld_json_returns_none():
    from fetch_bbcgoodfood import parse_recipe_page

    assert parse_recipe_page("<html><body>no recipe here</body></html>", "https://x/y") is None


# ---- foodwishes ---------------------------------------------------------------

def test_foodwishes_parse_recipe_page():
    from fetch_foodwishes import parse_recipe_page

    html_text = (FIXTURES / "foodwishes_sample.html").read_text(encoding="utf-8")
    rec = parse_recipe_page(
        html_text,
        "https://foodwishes.blogspot.com/2015/04/whole-grain-blueberry-scones-because.html",
    )
    assert rec is not None
    assert rec["source"] == "foodwishes"
    assert "spelt flour" in " ".join(rec["ingredients"]).lower()
    assert rec["yield_text"].startswith("8 Whole-Grain")


# ---- themealdb ----------------------------------------------------------------

def test_themealdb_parse_meal():
    from fetch_themealdb import parse_meal

    data = json.loads((FIXTURES / "themealdb_sample.json").read_text(encoding="utf-8"))
    meal = data["meals"][0]
    rec = parse_meal(meal)
    assert rec["source"] == "themealdb"
    assert rec["id"] == f"themealdb:{meal['idMeal']}"
    assert rec["title"] == meal["strMeal"]
    assert len(rec["ingredients"]) > 0
    assert rec["ingredients"][0]  # non-empty measure+ingredient line
    assert len(rec["steps"]) > 0
    assert rec["category"] == meal["strCategory"]


# ---- openrecipes ----------------------------------------------------------------

def test_openrecipes_parse_line():
    from fetch_openrecipes import parse_line

    lines = (FIXTURES / "openrecipes_sample.jsonl").read_text(encoding="utf-8").splitlines()
    raw = json.loads(lines[0])
    rec = parse_line(raw, 0)
    assert rec["source"] == "openrecipes"
    assert rec["title"] == "Drop Biscuits and Sausage Gravy"
    assert rec["steps"] == []
    assert any("Baking Powder" in i for i in rec["ingredients"])
    assert rec["prep_time_min"] == 10
    assert rec["cook_time_min"] == 30
    assert rec["source_url"].startswith("http://thepioneerwoman.com")


def test_openrecipes_parse_line_no_name_drops():
    from fetch_openrecipes import parse_line

    assert parse_line({"ingredients": "x"}, 0) is None


def test_foodwishes_no_ingredients_marker_drops():
    from fetch_foodwishes import parse_recipe_page

    html_text = (
        "<div class='post-body entry-content'>Just a story, no recipe here.</div>"
        "<div class='post-footer'>x</div>"
    )
    assert parse_recipe_page(html_text, "https://foodwishes.blogspot.com/x.html") is None


# ---- fetch_sites (cuisine sites, S17) --------------------------------------------

_TEST_SITE = {
    "id": "testsite",
    "cuisine_label": "indian",
    "base_url": "https://example.com",
    "sitemap_urls": ["https://example.com/sitemap.xml"],
    "url_filter": r"^https://example\.com/[a-z0-9-]+/$",
}


def test_fetch_sites_wprm_graph_shape():
    """WPRM/Yoast-style: the Recipe node is inside an @graph alongside WebPage/BreadcrumbList,
    seen live on hebbarskitchen.com, thewoksoflife.com, indianhealthyrecipes.com."""
    from fetch_sites import parse_recipe_page

    html_text = (FIXTURES / "cuisine_wprm_sample.html").read_text(encoding="utf-8")
    rec = parse_recipe_page(html_text, "https://example.com/paneer-butter-masala-recipe/", _TEST_SITE)
    assert rec["id"] == "testsite:paneer-butter-masala-recipe"
    assert rec["source"] == "testsite"
    assert rec["title"] == "Paneer Butter Masala"
    assert rec["ingredients"] == [
        "2 cups paneer, cubed",
        "1 cup tomato puree",
        "2 tbsp butter",
        "1/2 cup cream",
    ]
    assert len(rec["steps"]) == 3
    assert rec["cuisine_label"] == "indian"  # from sites.yaml, not the page's own recipeCuisine
    assert "Indian" in rec["tags"]  # the page's own recipeCuisine is kept as a tag
    assert rec["category"] == "Main Course"
    assert rec["prep_time_min"] == 15
    assert rec["cook_time_min"] == 30
    assert rec["total_time_min"] == 45
    assert rec["yield_text"] == "4 servings"
    assert rec["rating"] == 4.8
    assert rec["rating_count"] == 120
    assert rec["image_url"] == "https://example.com/images/paneer.jpg"


def test_fetch_sites_flat_recipe_shape():
    """A bare top-level Recipe object with no @graph wrapper, seen live on giallozafferano.com,
    archanaskitchen.com, mygreekdish.com."""
    from fetch_sites import parse_recipe_page

    html_text = (FIXTURES / "cuisine_flat_sample.html").read_text(encoding="utf-8")
    site = {**_TEST_SITE, "cuisine_label": "greek"}
    rec = parse_recipe_page(html_text, "https://example.com/greek-pancakes/", site)
    assert rec["title"] == "Greek-Style Pancakes with Honey and Walnuts"
    assert len(rec["ingredients"]) == 4
    # A string recipeInstructions (not a list) is still turned into one step.
    assert rec["steps"] == [
        "Whisk the batter, fry small pancakes until golden, top with honey and walnuts."
    ]
    assert rec["rating"] == 4.9
    assert rec["rating_count"] == 45
    assert rec["image_url"] == "https://example.com/images/tiganites.jpg"


def test_fetch_sites_custom_app_shape():
    """A non-WordPress custom recipe app with multiple ld+json blocks on one page (a plain
    WebPage block plus the Recipe block), seen live on nyonyacooking.com."""
    from fetch_sites import parse_recipe_page

    html_text = (FIXTURES / "cuisine_custom_sample.html").read_text(encoding="utf-8")
    site = {**_TEST_SITE, "cuisine_label": "malaysian"}
    rec = parse_recipe_page(html_text, "https://example.com/recipes/sambal-ayam~ABC123", site)
    assert rec["title"] == "Sambal Ayam (Authentic Malaysian Spicy Chicken)"
    assert len(rec["ingredients"]) == 5
    assert len(rec["steps"]) == 3
    assert rec["rating"] == 4.6
    assert rec["rating_count"] == 88


def test_fetch_sites_non_string_yield_coerced():
    """Some sites emit recipeYield as a bare integer, not a string (seen live on
    nyonyacooking.com, which broke an earlier version of this parser with a TypeError)."""
    from fetch_sites import parse_recipe_page

    html_text = """
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Recipe","name":"Test Curry",
     "recipeIngredient":["1 onion","2 tomatoes"],
     "recipeInstructions":["Cook it."],
     "recipeYield": 4}
    </script>
    """
    rec = parse_recipe_page(html_text, "https://example.com/test-curry/", _TEST_SITE)
    assert rec["yield_text"] == "4"


def test_fetch_sites_no_recipe_ld_drops():
    from fetch_sites import parse_recipe_page

    html_text = "<html><head><title>Just a blog post</title></head><body>No recipe here.</body></html>"
    assert parse_recipe_page(html_text, "https://example.com/blog/", _TEST_SITE) is None


def test_fetch_sites_israeli_exclusion_r16():
    from fetch_sites import israeli_exclusion_reason

    assert israeli_exclusion_reason({"title": "Classic Israeli Shakshuka"}) is not None
    assert israeli_exclusion_reason({"title": "Israeli Salad", "tags": []}) is not None
    assert israeli_exclusion_reason(
        {"title": "Fattoush Salad", "cuisine_label": "palestinian", "tags": ["levantine"]}
    ) is None
    # Word-boundary check: "Israeli" inside another word should not false-positive.
    assert israeli_exclusion_reason({"title": "Misraeli Family Stew"}) is None


def test_fetch_sites_sites_yaml_loads():
    from fetch_sites import load_sites

    sites = load_sites()
    assert len(sites) >= 3
    ids = [s["id"] for s in sites]
    assert len(ids) == len(set(ids)), "duplicate site id in sites.yaml"
    for s in sites:
        for key in ("id", "cuisine_label", "base_url", "sitemap_urls", "url_filter"):
            assert key in s, f"{s.get('id')} missing {key}"
        re.compile(s["url_filter"])  # must be a valid regex
