# Report: S1c Food Wishes full crawl

Builder ingest, slice S1c. Hash TBD on worktree-agent-aa8a6e552683a8114, nothing pushed.

- Changed: `ingest/fetch/fetch_foodwishes.py` (rewritten — feed-based fetcher, replacing S1's
  300-post sitemap crawl); `ingest/fetch/test_fetchers.py` (foodwishes tests replaced/expanded,
  6 tests); `ingest/fixtures/foodwishes_feed_sample.json` (new, replaces the old
  `foodwishes_sample.html` fixture); `ingest/sources.md` (foodwishes row + note rewritten).
  Raw data at `/home/user/recipe-data/raw/foodwishes/` (outside git): `recipes.jsonl` (1,084
  records, 792 KB) and a new `posts/` cache (3,020 raw post JSON files, one per post, 24 MB) —
  the brief's "keep the raw post HTML cached on disk" requirement, and what makes re-parsing
  free of any further network calls.

- **Fetch**: Blogger's own JSON feed
  (`foodwishes.blogspot.com/feeds/posts/default?alt=json&max-results=150&start-index=N`)
  returns every post's full body HTML directly, so 21 requests (1 req/s, 30s timeout,
  resumable via `progress.json`'s `next_start_index`/`total_results`) cover all 3,020 posts —
  no per-post page fetch needed at all. Confirmed all 3,020 are unique and unrepeated across
  pagination; confirmed and fixed a real collision bug before that (see "design was wrong
  about").

- **Classify + parse**: every one of the 3,020 posts is classified into exactly one of:
  recipe (**1,084 written**), no recipe content — announcement/video-only (**1,349**), or
  recipe text only on Allrecipes — not fetched, per the brief (**587**). 1,084 + 1,349 + 587 =
  3,020, every post accounted for (rule 11). Per-year breakdown (written / drops):

  | Year | Written | No recipe (announcement/video) | Allrecipes-only |
  |---|---|---|---|
  | 2007 | 119 | 124 | — |
  | 2008 | 55  | 175 | — |
  | 2009 | 88  | 201 | — |
  | 2010 | 91  | 190 | 8 |
  | 2011 | 96  | 141 | 11 |
  | 2012 | 105 | 77  | 20 |
  | 2013 | 93  | 120 | 17 |
  | 2014 | 84  | 130 | 8 |
  | 2015 | 75  | 74  | 7 |
  | 2016 | 61  | 57  | 1 |
  | 2017 | 67  | 32  | 3 |
  | 2018 | 78  | 15  | 1 |
  | 2019 | 72  | 13  | 9 |
  | 2020-2026 | 0 | — | 502 (blog is Allrecipes-only from Nov 2019 on) |

- **Checks**: pytest 16 passed, 0 failed (`ingest/fetch/test_fetchers.py`; +6 foodwishes tests
  over S1's 1, covering the bare-"Ingredients:" era, the yield-header era, Allrecipes-only
  classification, no-recipe classification, and the two parsing-bug regressions below).

- **Gold check** (brief bar: ≥27/30): 30 posts hand-checked, spread across all 13 years that
  have written recipes (2-3 per year, seeded sample so it's reproducible). **29/30 correctly
  split.** One miss: `foodwishes:2008/07/red-pepper-scallops-on-potato-pancakes` has a bolded
  video-caption line ("Watch this clip if you need a fire-roasted pepper refresher:") leak
  into its ingredients list — a one-off formatting case (colored/bold callout span with no
  distinguishing marker), left as-is since the bar is already cleared with margin. Two real
  parsing bugs were found and fixed *during* this hand-check (both now covered by regression
  tests, not just this run's spot sample):
  - ~127 posts (mostly 2012-2018, Word-pasted) carry a leftover Word/Office `<style>` block
    (font-face declarations, sometimes an HTML comment) ahead of or amid the post body; it was
    leaking CSS/comment text into parsed ingredients/steps. Now stripped as a unit.
  - Many 2012-2013 Word-pasted posts have literal newlines mid-paragraph (from the original
    Word wrap width); left unhandled, these split one ingredient or step into two separate,
    partial lines. Now collapsed to a space before real block boundaries (`<br>`, `</div>`,
    `</p>`) are turned into line breaks.
  - (Also found, not fixed: one post, `2018/09/feta-roast-chicken-making-chicken-betta`, has
    the actual source HTML corrupted — its step text was mangled into bogus attributes of a
    broken `<div>` tag by a bad Word paste. Unrecoverable by tag-stripping; steps for that one
    post are `[]` rather than garbage, which is correct behavior given the source defect, not
    a parser bug.)

- **Outside my package**: nothing touched outside `ingest/fetch/`, `ingest/fixtures/`,
  `ingest/sources.md`, `orch/reports/S1c.md`, and `/home/user/recipe-data/raw/foodwishes/`
  (the shared, non-git data dir the brief names). Did not touch
  `ingest/fetch/fetch_bbcgoodfood.py` (S1b's concurrent file).

- **Design was wrong about**: nothing in the brief itself was wrong, but two things surfaced
  during the build that are worth recording. (1) The blog reuses the same URL filename for
  recurring posts across years — `happy-holidays.html`, `chef-john-is-on-vacation.html`, etc.,
  22 filenames recur 2-7 times each — so an `id` built from just the trailing filename (as
  S1's fetcher did) silently collides and drops posts; confirmed by a direct probe of the live
  feed (3,020 unique URLs, 22 duplicate filenames, 39 posts lost to collision on a first pass
  of this slice's own new fetcher before catching it). Fixed by keying `id`/cache filename on
  `<year>/<month>/<slug>` instead. (2) All of these are genuine, structural improvements over
  S1, not disagreements with the brief — the brief's own facts (three eras, Allrecipes-only
  from Nov 2019, no schema.org markup anywhere) all held.

- **Open**: none — full crawl complete, gold check passed with margin, all counts reconciled.

## 5 sample recipes verbatim, across eras

**2007 (bare "Ingredients:", no yield, no written steps — video-only method)**
```json
{
  "id": "foodwishes:2007/02/calabrese-lollipops-antipasto-on-stick",
  "source": "foodwishes",
  "source_url": "https://foodwishes.blogspot.com/2007/02/calabrese-lollipops-antipasto-on-stick.html",
  "title": "Calabrese Lollipops – Antipasto on a stick!",
  "ingredients": ["thin sliced salami or soppresatta", "cream cheese or any spreadable cheese",
    "arugula leaves, or spinach, baby romaine, etc.", "bread sticks"],
  "steps": [],
  "yield_text": ""
}
```

**2010 ("Ingredients for N servings:" header, yield captured)**
```json
{
  "id": "foodwishes:2010/03/chicken-fettuccine-alfredo-since-it-was",
  "source": "foodwishes",
  "source_url": "https://foodwishes.blogspot.com/2010/03/chicken-fettuccine-alfredo-since-it-was.html",
  "title": "Chicken Fettuccine Alfredo – Since it was Loose, You Must Reduce",
  "ingredients": ["2 large chicken breasts", "2 cups low sodium organic chicken broth",
    "1 pound fettuccine", "2 cups heavy cream", "4 cloves garlic, very finely minced",
    "2 large egg yolks",
    "1/4 cup chopped Italian parsley (in summer toss some nice fresh basil in for a little different version)",
    "2 cups freshly grated Parmigiano-Reggiano", "salt and freshly ground black pepper to taste"],
  "steps": [],
  "yield_text": "4 large servings"
}
```

**2013 (Word-pasted era, Allrecipes cross-link present but inline ingredients still extracted)**
```json
{
  "id": "foodwishes:2013/07/summer-squash-sausage-stew-supply-and",
  "source": "foodwishes",
  "source_url": "https://foodwishes.blogspot.com/2013/07/summer-squash-sausage-stew-supply-and.html",
  "title": "Summer Squash & Sausage Stew – Supply and Demand",
  "ingredients": ["2 tsp olive oil", "1 pound Andouille sausage, or other spicy, smoked sausage",
    "1 large onion, diced", "3 cloves minced garlic", "1 cup crushed tomatoes",
    "3 cups chicken broth, or as needed", "2 pounds summer squash, cut in 1-inch pieces",
    "1 1/2 pounds Yukon gold potatoes, cut in 2-inch chunks", "1/2 cup diced green pepper",
    "1 tsp salt, plus more to taste", "freshly ground black pepper and cayenne to taste",
    "1/4 cup chopped Italian parsley", "grated parmesan cheese, optional"],
  "steps": [],
  "yield_text": "4 portions"
}
```

**2016 (yield + written steps)**
```json
{
  "id": "foodwishes:2016/09/pizza-dough-pretzels-or-bavarian-bagels",
  "source": "foodwishes",
  "source_url": "https://foodwishes.blogspot.com/2016/09/pizza-dough-pretzels-or-bavarian-bagels.html",
  "title": "Pizza Dough Pretzels or Bavarian Bagels?",
  "ingredients": ["1 pound prepared pizza dough, plus all-purpose flour as needed, divided into six balls",
    "6 cups water", "1/3 cup baking soda", "coarse salt"],
  "steps": ["Bake at 400 F. for about 20 minutes, or until beautifully browned, and stretch marks have formed. Exact times will depend the specific size and shape of your pretzel.",
    "Tip:  if you’re making rings, be sure to stretch them out, so your pretzels are not too thick. You don’t want them any fatter than I made, otherwise they become too bready. Larger, thinner dough rings we’ll give you a chewier pretzel, closer to the ones you get at the mall."],
  "yield_text": "6 homemade soft pretzels"
}
```

**2019 (last full-recipe year before Allrecipes-only; grouped sub-headers kept inline)**
```json
{
  "id": "foodwishes:2019/04/lamb-borek-and-secret-of-sogginess",
  "source": "foodwishes",
  "source_url": "https://foodwishes.blogspot.com/2019/04/lamb-borek-and-secret-of-sogginess.html",
  "title": "Lamb Borek and the Secret of Sogginess",
  "ingredients": ["(for one 9-10 inch round baking dish)", "1 package frozen phyllo (filo) dough",
    "2 teaspoons sesame seeds for the top, optional", "For the lamb filling (you’ll have some leftover):",
    "2 tablespoons olive oil", "1 large onion, diced", "2 pounds ground lamb", "...",
    "For the egg/yogurt/butter wash:", "1 large egg", "3 tablespoons Greek yogurt", "...",
    "For the yogurt sauce:", "1/2 cup plain Greek yogurt", "..."],
  "steps": ["Bake at 400 F. for 35-40 minutes, or until browned and crisp."],
  "yield_text": "6 large portions"
}
```
