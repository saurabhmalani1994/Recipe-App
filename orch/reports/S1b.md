Builder ingest/fetch, slice S1b. Hash <FILL-AFTER-COMMIT> on worktree-agent-aff4b3e04158f231e, nothing pushed.

- Changed:
  - `ingest/fetch/fetch_bbcgoodfood.py`: root cause was `recipeYield` (and `image`,
    `recipeCategory`, `recipeCuisine`) being a bare value (int, or a non-list object) on
    live pages instead of the assumed str-or-list; `yield_text[0]` on an int raised
    `TypeError: 'int' object is not subscriptable` on every such page. Added a
    `_first_str()` helper that walks str/int/float/list/dict shapes to the first usable
    string, used it for all four fields, generalized `@type` matching to accept a list of
    types (`_has_recipe_type`), and let `recipeInstructions` be a single dict as well as a
    list, with `itemListElement` entries that are bare strings.
  - `ingest/fetch/sitemap_crawler.py`: fixed a second bug found while reproducing — every
    parse-error exception also fell through to the `if rec is None` branch below it, so
    each real failure was counted twice (as `parse error: TypeError` *and* `no recipe data
    parsed from page`, both landing on exactly 11834 in the crawl summary). Now `continue`s
    right after recording the parse-error drop. Added a `retry_failed` mode: progress.json
    gains a `parse_failed_urls` key populated as parse-related drops happen; a
    `--retry-failed` run re-visits only those URLs (falling back, once, to
    `tried_urls - written_urls` for progress files saved before this key existed), with
    `cap` bounding *attempts* this run rather than the cumulative written total. A URL is
    dropped from the set on a clean parse, kept on failure.
  - `ingest/fetch/fetch_bbcgoodfood.py` `__main__`: added `argparse` (`--cap`,
    `--retry-failed`); `run()` skips the sitemap-discovery stage entirely in retry mode.
  - `ingest/fetch/test_fetchers.py`: three new pytest cases, one per JSON-LD shape:
    bare-int yield/list image (the real bug, from a live captured page), a bare-string
    image + list `@type` + dict-shaped `recipeInstructions`, and an `@graph` document with
    dict `recipeCategory` + `HowToSection`s mixing dict/string `itemListElement` entries.
  - `ingest/fixtures/bbcgoodfood_int_yield.html`, `bbcgoodfood_string_image.html`,
    `bbcgoodfood_howto_sections.html`: new fixtures backing the tests above.

- Reproduction: fetched 10 URLs the crawler had tried but never written (1 req/s, 20s
  timeout), taken from `/home/user/recipe-data/raw/bbcgoodfood/progress.json`'s
  `tried_urls` minus the ids already in `recipes.jsonl`. All 10 raised the identical
  `TypeError: 'int' object is not subscriptable` at `fetch_bbcgoodfood.py:123`
  (`yield_text[0]`); `recipeYield` was a plain int (2, 4, 12, ...) on every one. All 10
  parse cleanly under the fix.

- Checks: pytest 15 passed, 0 failed (`cd ingest/fetch && python3 -m pytest
  test_fetchers.py -v`).

- Capped retry-failed run (200), against the live `/home/user/recipe-data/raw/bbcgoodfood/`
  data, per the brief:
  ```
  written 4672 (was 4473; +199)
  drops: {"page fetch failed (non-200 or timeout)": 1}
  ```
  199 of 200 previously-dropped URLs now parse and write; the one remaining drop is a
  genuine fetch failure, not a parse issue. `progress.json`'s `parse_failed_urls` shrank
  from 12955 to 12756 (12955 − 199 resolved − 0 re-added). `page_urls`/`tried_urls` counts
  are unchanged (17456 / 17428), so the existing resumable progress is intact.

- Exact command for the full retry (run from `ingest/fetch/`, ~12756 candidates
  remaining as of this run — pass a cap comfortably above that so it drains the whole
  backlog in one pass; it will stop early if it runs out of candidates):
  ```
  cd ingest/fetch && python3 fetch_bbcgoodfood.py --retry-failed --cap 13000
  ```
  At 1 req/s this is roughly 3.5 hours; matches the brief's estimate for a full re-crawl
  and is meant to be run as the orchestrator's background script, not inline here.

- Outside my package: none.
- Design was wrong about: the brief named one bug (the `TypeError`); there were
  effectively two — the `TypeError` itself, and a bookkeeping bug in
  `sitemap_crawler.py` that double-counted every parse failure under two different drop
  reasons (explaining why `parse error: TypeError` and `no recipe data parsed from page`
  were both exactly 11834 in the brief's summary). Both are fixed; only one crawl anomaly
  should remain in future summaries where a page's own parse truly returns no data.
- Open: none.
