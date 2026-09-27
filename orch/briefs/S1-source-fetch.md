# Brief S1: source fetch and survey
From the orchestrator, release v0.1. Owner decisions: D3 "Curated ~50-100k", D4 NYT skipped.
Base: claude/funny-thompson-jcmpox. Scope: `ingest/fetch/`, `ingest/sources.md`,
`schema/raw_recipe.md`, `ingest/fixtures/`. Raw data goes to /home/user/recipe-data/raw/<source>/.
Model: mid. Effort: medium.

Deliverable:
1 Define the common raw format in `schema/raw_recipe.md` as JSONL, one recipe per line: id, source,
  source_url, title, ingredients[] (raw strings), steps[], cuisine_label?, category?, rating?,
  rating_count?, total_time_min?, prep_time_min?, cook_time_min?, yield_text?, image_url?,
  tags[]. `ingest` owns this schema.
2 Resumable Python fetchers (use requests; pip install whatever else you need), each emitting
  that JSONL:
  a Open datasets: RecipeNLG (find a reachable mirror, e.g. Hugging Face), Food.com (Kaggle
    or HF mirror, which has ratings). Fetch in full if under 3 GB total.
  b GitHub repos the owner listed. `git clone --depth 1` works (github.com HTML/API return
    403, but git and raw.githubusercontent work): dspray95/open-recipe,
    suicideskyfall53/Cookdiary-Full-Version, chadweimer/gomp, samikshadubey23/recipe-generator.
    Extract any recipe data they contain; if one has none, say so.
  c schema.org JSON-LD scrapers for bbcgoodfood.com and foodwishes.blogspot.com, working from
    the sitemap or archive. Limit to 1 request per second with a 20 s timeout per page, and cap
    at 300 recipes per site in this slice. The crawler must be resumable so a later run can
    finish it.
  d allrecipes.com answers 402 to curl, even with a browser user agent. Try headless Chromium
    (Playwright, executablePath /opt/pw-browsers/chromium) on 3 recipe pages and report only
    whether it works. Do not build a full crawler.
  e Survey other free sources (e.g. TheMealDB, openrecipes dump, Epicurious datasets, Wikibooks
    Cookbook, other HF recipe datasets). Fetch up to 2 of the best if each takes under 30 min.
3 `ingest/sources.md`: one row per source with reachable?, recipes fetched, fields present
  (ratings? cuisine? times?), size on disk, license note, and the drop counts with reasons.
4 `ingest/fixtures/ingredient_lines_sample.txt`: 3000 raw ingredient lines, sampled evenly
  across sources and deduplicated. The next slice (the parser) boots from it.
5 pytest for each fetcher's parse function on a small saved HTML/JSON fixture.
Out of scope: normalization, dedupe, tagging, and building corpus.db.
Checks: pytest counts. Record every skipped or failed item with a reason (rule 11).
Report per ORCHESTRATION §6 plus 3 sample raw recipes verbatim (one per source kind).
