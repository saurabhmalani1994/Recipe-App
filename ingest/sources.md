# Sources

One row per source fetched for slice S1. Raw JSONL for each lives at
`/home/user/recipe-data/raw/<source>/recipes.jsonl` (schema: `schema/raw_recipe.md`), outside
git. "Fields present" is measured on a sample (5000 rows, or the whole file if smaller); a
blank cell means that field was not observed. Every drop is counted with a reason at fetch
time (rule 11); the counts below are each fetcher's own `drops` summary.

| Source | Reachable? | Recipes fetched | Ratings? | Cuisine? | Times? | Size on disk | License |
|---|---|---|---|---|---|---|---|
| `recipenlg` | yes | 2,231,142 | no | no | no (has steps only) | 4.4 GB (incl. 2.2 GB source CSV) | Unspecified/"unknown" per the dataset card; original RecipeNLG paper (Bień et al. 2020) says research use |
| `foodcom` | yes, but see note | 1,228 | yes (983/1228) | no | yes (958/1228) | 34 MB | MIT (per HF dataset card) |
| `bbcgoodfood` | yes | 245 (cap 300, resumable) | no (not present on any page seen) | yes (81/245) | yes (243/245) | 1.8 MB | BBC/Immediate Media, all rights reserved — editorial content, not permissively licensed; keep for personal use only per D14 |
| `foodwishes` | yes, but see note | 300 (cap 300) | no | no | no | 572 KB | Chef John / Food Wishes, all rights reserved — personal use only |
| `themealdb` | yes | 790 (full free tier) | no | yes (area, 600/790) | no | 1.2 MB | TheMealDB "test" API is free for non-commercial/personal use |
| `openrecipes` | yes, but see note | 168,442 | no | no | yes (335/5000 sampled; sparse) | 139 MB | Public dump of the (defunct) openrecipes.org project; itself aggregated from many sites' schema.org markup — per-recipe `source_url` retained |
| `github_openrecipe` (dspray95/open-recipe) | yes | 2 | no | no | no | 102 MB (mostly a checked-in Python venv; the data itself is ~1 KB) | repo has no LICENSE beyond MIT badge in README; treat as personal-use sample only |
| `github_cookdiary` (suicideskyfall53/Cookdiary-Full-Version) | yes, but no data | 0 | — | — | — | 248 KB | n/a — see note |
| `github_gomp` (chadweimer/gomp) | yes, but no data | 0 | — | — | — | 3.2 MB | n/a — see note |
| `github_recipegen` (samikshadubey23/recipe-generator) | yes | 5 | no | no | no | 6.3 MB | repo's own README pushes an external "release" download link (see note); the 5 example files themselves carry no explicit license |

Grand total written: **2,402,152** raw records across 8 usable sources, ~4.6 GB on disk
under `/home/user/recipe-data/raw/` (RecipeNLG's 2.2 GB source CSV cache dominates).

## Notes and drop counts, per source

### `recipenlg` — RecipeNLG (Bień et al. 2020)
The original RecipeNLG download is gated behind a manual registration form on the paper's own
site, so this uses the `innovate-data/RecipeNLG` mirror on Hugging Face
(`RecipeNLG_dataset.csv`, 2.2 GB, reachable with a plain GET). Fetched in full per the brief
("under 3 GB total"). Fields: `title`, `ingredients` (JSON list), `directions` (steps), `link`
(kept as `source_url`), `NER` (kept as `tags`). No ratings, cuisine or times in this dataset.
Drops: 2,588 duplicate ids (the mirror's own row 0 index is not unique across ~2.23M rows in a
handful of places).

### `foodcom` — Food.com recipes with ratings
Uses the `AkashPS11/recipes_data_food.com` mirror on Hugging Face (MIT license, has the
`AggregatedRating`/`ReviewCount` columns the brief specifically wanted). **Important finding**:
this mirror's `recipes.csv` (34 MB) and its own Hugging-Face-generated Parquet conversion both
contain only **1,228 populated rows out of 1,048,543** — everything else is an all-blank
placeholder row. This was verified two ways: (1) parsing the CSV directly, and (2) downloading
HF's server-side parquet conversion of the same file and counting non-null `Name` values
(1,228 in both). This is a data-quality defect in the upstream dataset itself, not a fetch
error on our side — the file's byte size matches its `Content-Length` exactly, so nothing was
truncated in transit. The 1,228 real rows are good quality (title, ingredients with
quantities, full steps, category, ratings, times, image, tags) and are kept; a fuller
alternative mirror (`Karo8870/food.com-parsed-dataset`, 682 MB, ~1M real rows) was found but
carries no rating columns at all and has its own `steps` column bug (it holds the images list,
not instructions), so it was not substituted in this slice — flagging it here as a candidate
for slice S1 follow-up if more Food.com volume is wanted later. Drops: 1,047,315 rows with no
title (the placeholder rows above).

### `bbcgoodfood` — schema.org/Recipe JSON-LD scrape
Page list comes from the site's own recipe sitemaps
(`bbcgoodfood.com/sitemap.xml` → the `*-recipe.xml` children), not a search crawl. Each page's
`<script type="application/ld+json">` Recipe block is complete (ingredients, instructions,
times, yield, image) even though the article body itself is paywalled
(`isAccessibleForFree: false`), so only that block is read. Rate-limited to 1 req/s, 20s
timeout, cap 300 per the brief; stopped at **245/300** for this slice — the crawler is fully
resumable (`progress.json` records the discovered URL list and which have been tried), so a
later run picks up exactly where this one stopped. No `aggregateRating` was present on any
page fetched. Drops so far: a handful of "page fetch failed" (timeouts) and "no ld+json Recipe
block" pages; exact counts are in the source's own `progress.json`/summary, not repeated here
since the crawl is incomplete.

### `foodwishes` — foodwishes.blogspot.com
**Not** a schema.org/JSON-LD site: checked multiple posts across the blog's full date range
(2007 to 2026) and found zero `<script type="application/ld+json">` blocks and zero
`itemprop` microdata anywhere. Instead, posts from roughly 2010–2019 have a plain-text
"Ingredients for N servings:" block inline in the post body; posts before that era are
video-only with no on-page recipe text, and posts from November 2019 onward (per the blog's
own announcement post) drop the written recipe entirely and link out to allrecipes.com for
"the complete, printable recipe" — which the brief already flags as blocked (402). This
fetcher extracts the 2010–2019 inline-text era only. Page list comes from the blog's own
paginated `sitemap.xml?page=1..4`; the crawler reorders that list to try the productive
2009–2018-dated URLs first (confirmed by URL date) so the capped run spends its budget where
it pays off, and is otherwise resumable the same way as bbcgoodfood. Reached the 300 cap.
Drops: 10 pages with no "Ingredients for" marker found in this run (mostly stragglers at the
edges of the reordered list); the many pre-2019/post-2019 pages that structurally have no
recipe text were not enqueued at all once discovered.

### `themealdb` — TheMealDB free tier
No auth needed (test API key `1`). The free tier has no "list everything" endpoint, so this
iterates `search.php?f=<letter>` for a–z and dedupes by `idMeal`; a reachability probe found
790 total recipes this way, and all 790 were fetched (took well under a minute — one of the
"other free sources" picks). Clean, structured: category, area (kept as `cuisine_label`), up
to 20 ingredient+measure pairs, full instructions. No ratings.

### `openrecipes` — the openrecipes.org project dump
The (defunct) openrecipes.org project's public dump is still mirrored on S3
(`s3.amazonaws.com/openrecipes/20170107-061401-recipeitems.json.gz`, 30 MB compressed, reachable
with a plain GET) — the other "other free sources" pick, chosen because it aggregates ~173k
recipes from many different recipe sites' schema.org markup circa 2013–2017, each with its own
`source_url`. **Caveat, confirmed by inspection**: this dump has no instructions/steps field at
all in any record — only name, ingredients (as one newline-joined string, split into lines
here), url, source site name, times, yield and image. Kept anyway for ingredient-line variety
and cross-site coverage; every record is written with `steps: []`. Drops: 4,836 rows with empty
name.

### GitHub repos (owner-listed)
`github.com`'s HTML and REST API return 403 in this container, but `git clone --depth 1` and
`raw.githubusercontent.com` work, confirming the brief's own note.
- **dspray95/open-recipe**: a BBC Good Food Scrapy spider project. Its checked-in sample output
  (`src/recipe_builder/out.json`) has exactly **2** recipes — extracted and kept. The bulk of
  the repo's 102 MB is a committed Python `venv/`, not data.
- **suicideskyfall53/Cookdiary-Full-Version**: **0** recipes. On inspection this repo is not a
  recipe app at all — it's a link-farm/fake-release page (a README that pushes an external
  "download" button to a third-party site, `.github/workflows/` containing a scheduled Action
  that fabricates commit activity/README churn to look active). Flagged and not treated as a
  data source; not something to build against.
- **chadweimer/gomp**: a real, legitimate self-hosted recipe-manager web app (Go + Postgres),
  but the repo ships only its DB migrations (schema), no seed or sample recipe rows. **0**
  recipes — "if one has none, say so," per the brief.
- **samikshadubey23/recipe-generator**: a Claude Skill (recipe-generation prompt template)
  with **5** checked-in example outputs (`example/*.md`, Chinese, AI-generated, markdown-table
  ingredients + numbered steps) — extracted and kept, tagged `synthetic`/`ai-generated` so
  downstream slices can exclude or down-weight them. Its README also pushes an external
  "release" zip download in the same suspicious pattern as Cookdiary, so the repo itself is not
  trusted beyond those 5 static example files.

### `allrecipes.com`
Confirmed blocked exactly as the brief describes: plain `curl` (with a browser User-Agent)
gets HTTP 402 on recipe pages. Per the brief, tried headless Chromium via Playwright
(`/opt/pw-browsers/chromium-1194`, `--ignore-certificate-errors` needed for this container's
proxy) on 3 recipe pages instead of curl. **Result: still blocked** — Playwright gets HTTP 403
and a page titled "Simple Page" (a bot-challenge interstitial, not the site) on all 3 URLs, no
`ld+json` present. No full crawler was built, per the brief's instruction.

### Other free sources surveyed but not fetched
- **Epicurious dataset**: HF search turned up only unrelated/tangential datasets (compounds,
  flavor-profile classification tasks), nothing resembling a clean Epicurious recipe dump; not
  pursued further given the two picks above already met the "up to 2" budget.
- **Wikibooks Cookbook**: `en.wikibooks.org`'s API returned HTTP 429 (rate-limited) on the
  first probe; not retried, since TheMealDB and openrecipes already filled the "2 best, each
  under 30 min" slot.
- **NYT Cooking**: skipped per D4 (owner: "Skip it").
