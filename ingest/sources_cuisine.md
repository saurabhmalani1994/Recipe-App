# Cuisine-specialist sources (slice S17)

Per D19 (owner, verbatim): "also find sites that do good indian cooking, chinese cooking,
korean cooking, japanese cooking, malaysian cooking, singaporean cooking, italian cooking,
french cooking, mediterranean cooking - no israeli food only palestinian/greek/egyptian/persian".
R16 excludes Israeli-presenting sites from ingest. D17 (no Southern/Midwest US, no Cool
Whip/sour-cream style) and D18 (fresh ingredients) are general style signals, not a per-site
filter here — none of the candidates below are Southern/Midwest style sites.

Every candidate was checked the same way: base URL reachable with a plain `requests.get`
(browser User-Agent, no headless browser), `robots.txt` present and whether it allows `/`,
the sitemap URL found (via `robots.txt`'s `Sitemap:` line, `/sitemap.xml`, `/sitemap_index.xml`
or `/wp-sitemap.xml`), an approximate count of URLs in that site's recipe/post sitemap(s), and
3 sample pages checked for a `schema.org/Recipe` `<script type="application/ld+json">` block
(or `@graph` containing one). "JSON-LD: yes" below means at least one genuine recipe page in
the sample carried a `Recipe` block (a sampled hub/category/blog-index page with no LD is
expected and not counted against the site). Counts are from a live check on 2026-09-28; a
site's real sitemap will differ slightly by the time the fetcher runs against it.

Sites marked **KEEP** are in `ingest/fetch/sites.yaml`. Sites marked **DROP** are not, with
the reason a re-check should look at first.

## Indian

| Site | Reachable | robots `/` | Sitemap | ~Recipe URLs | JSON-LD | Verdict |
|---|---|---|---|---|---|---|
| indianhealthyrecipes.com (Swasthi) | yes (200) | allow | `/sitemap.xml` → `post-sitemap{,2}.xml` | unknown — see note | yes (3/3 real recipe pages) | **KEEP** |
| vegrecipesofindia.com | no — 403 on homepage and on every article page tried (same 403 with a plain browser UA and with `curl`) | allow | found, ~600 in first 3 post-sitemaps | fetch failed (403) | n/a | DROP — WAF/bot-block on all content requests |
| hebbarskitchen.com | yes (200) | allow | `/sitemap_index.xml` → `post-sitemap4.xml`+`post-sitemap5.xml`+tags | ~4,642 | yes (Recipe + AggregateRating + HowToStep confirmed on `paneer-butter-masala-recipe/`) | **KEEP** |
| archanaskitchen.com | yes (200) | allow | `/sitemap.xml` (flat) | ~10,600 (site total, includes non-recipe pages) | yes (`/recipe/<slug>` pages carry Recipe LD) | **KEEP** |

**Note on indianhealthyrecipes.com**: its own `wp-sitemap.xml` (Yoast) lists `post-sitemap.xml`
and `post-sitemap2.xml` with a `lastmod` of 2026-09-15, but requesting either file returns
HTTP 200 with a 0-byte body (`Content-Length: 0`, `Server: Sucuri/Cloudproxy`, a stale
`ETag`/`Last-Modified` dated Feb 2023) — a cached-empty response at their CDN edge, not a bot
block (the homepage and every individual recipe page fetch fine, with LD-JSON, on the same
requests). `fetch_sites.py` cannot discover this site's URL list from its sitemap as-is; it
needs the homepage/category-link fallback the survey script also had to use (see
`fetch_sites.py`'s `discover_urls`). Recipe count is therefore unknown until that fallback
runs a real crawl.

## Chinese

| Site | Reachable | robots `/` | Sitemap | ~Recipe URLs | JSON-LD | Verdict |
|---|---|---|---|---|---|---|
| thewoksoflife.com | yes | allow | `/sitemap.xml` → 2 post-sitemaps | ~1,578 | yes (2/3; the miss was a travel post, not a recipe) | **KEEP** |
| redhousespice.com | no — 403 on homepage and articles | allow | found, ~319 | fetch failed (403) | n/a | DROP — WAF/bot-block |
| chinasichuanfood.com | yes | allow | `/sitemap_index.xml` → 1 post-sitemap | ~729 | yes (`dumpling-wrappers/`) | **KEEP** |
| omnivorescookbook.com | yes | allow | `/sitemap_index.xml` | ~786 | yes (2/3) | **KEEP** |

## Korean

| Site | Reachable | robots `/` | Sitemap | ~Recipe URLs | JSON-LD | Verdict |
|---|---|---|---|---|---|---|
| maangchi.com | no — 403 on homepage | allow | none found (blocked before discovery) | — | — | DROP — WAF/bot-block |
| mykoreankitchen.com | no — 403 on homepage and articles | allow | found, ~387 | fetch failed (403) | n/a | DROP — WAF/bot-block |
| koreanbapsang.com | yes | allow | `/sitemap.xml` | ~275 | yes (2/3) | **KEEP** |
| beyondkimchee.com | yes | allow | `/sitemap_index.xml` | ~375 | yes (3/3) | **KEEP** |
| kimchimari.com | yes | allow | `/sitemap_index.xml` | ~387 | yes (2/3) | **KEEP** |

## Japanese

| Site | Reachable | robots `/` | Sitemap | ~Recipe URLs | JSON-LD | Verdict |
|---|---|---|---|---|---|---|
| justonecookbook.com | no — 403 on homepage | allow | none found (blocked before discovery) | — | — | DROP — WAF/bot-block |
| chopstickchronicles.com | yes | allow | `/sitemap_index.xml` | ~366 | yes (`kabocha-korokke-.../`) | **KEEP** |
| japanesecooking101.com | no — HTTP 202 (bot-challenge) on every plain GET, repeated | n/a | none | — | — | DROP — bot-challenge, never returns real content to a plain GET |
| sudachirecipes.com | no — 403 on homepage and articles | allow | found, ~681 | fetch failed (403) | n/a | DROP — WAF/bot-block |
| japan.recipetineats.com (RecipeTin Japan) | yes | n/a (no robots.txt; treated as allow) | `/sitemap.xml` → post-sitemap | ~438 | yes (confirmed on `spaghetti-napolitan-.../`, `mentaiko-pasta-.../`, `prawn-doria-.../` after the first 3 random picks landed on non-recipe attachment pages) | **KEEP** |
| pickledplum.com | yes | allow | `/sitemap_index.xml` | ~838 | yes (2/3) | **KEEP** |

## Malaysian

| Site | Reachable | robots `/` | Sitemap | ~Recipe URLs | JSON-LD | Verdict |
|---|---|---|---|---|---|---|
| rasamalaysia.com | no — 403 on homepage and articles | allow | found, ~1,411 | fetch failed (403) | n/a | DROP — WAF/bot-block |
| malaysianchinesekitchen.com | yes | allow | `/sitemap_index.xml` | ~147 | yes (2/3) | **KEEP** |
| nyonyacooking.com | yes | allow | `/sitemap.xml` (flat, mixes categories/recipes) | ~1,074 (site total; not recipe-only) | yes (`/recipes/<slug>~<id>` pages carry Recipe + HowToStep + NutritionInformation) | **KEEP** |
| klfoodie.com | yes | allow | `/sitemap_index.xml` | ~3,000 | no (3/3 sampled pages — cafe/venue write-ups, no Recipe schema seen on this site) | DROP — no schema.org Recipe markup found |
| themalaysiankitchen.com | yes | allow | `/sitemap_index.xml` | ~112 | no (3/3) | DROP — no Recipe markup found |
| shelives2eat.com | yes | allow | `/sitemap.xml` | ~70 | no (3/3) | DROP — no Recipe markup found |
| mammajay.com | no — no response (timeout/DNS) | — | — | — | — | DROP — unreachable |
| phonghongbakes.blogspot.com (Blogger) | yes | allow | Blogger's own paginated `sitemap.xml?page=N` (not a normal `<urlset>`, needs page-by-page pagination) | not measured this pass | no (3/3 checked) | DROP — no structured recipe data found; Blogger sitemap format needs bespoke handling, lower priority given no LD anyway |
| cookwithipohbunny.com | yes | allow | `/sitemap_index.xml` | ~146 | yes (2/3, `recipe-gingery-soya-sauce-chicken/` and `recipe-airfryer-curry-fried-chicken/`) | **KEEP** |

## Singaporean

| Site | Reachable | robots `/` | Sitemap | ~Recipe URLs | JSON-LD | Verdict |
|---|---|---|---|---|---|---|
| noobcook.com | yes | allow | `/sitemap_index.xml` | ~1,884 | no — checked 3 pages across old and a 2023-dated post; none carry `application/ld+json` Recipe (site has no recipe-card plugin/schema at all, just plain HTML) | DROP — no schema.org Recipe markup found |
| rotinrice.com | yes | allow | `/sitemap_index.xml` | ~913 | yes (`pistachio-pesto-crusted-whitefish/`) | **KEEP** |
| singaporeanmalaysianrecipes.com | yes | allow | `/sitemap.xml` | ~154 | yes (2/3) | **KEEP** |
| mysingaporefood.com | yes | allow | `/sitemap_index.xml` (has a dedicated `recipe-sitemap.xml`) | ~81 | no (3/3, including 2 `/recipe/...` pages) | DROP — has a recipe sitemap but pages carry no Recipe LD-JSON |
| eatwhattonight.com | no — HTTP 429 on every request, repeated after a longer pause | allow | none (blocked before discovery) | — | — | DROP — rate-limited/blocked |

Only 2 kept (rotinrice.com, singaporeanmalaysianrecipes.com) against the brief's "at least 3
per cuisine" for the *candidate* list (5 were checked, satisfying that), but only 2 pass the
keep bar — flagged as an open item below rather than padding `sites.yaml` with a site that
fails the JSON-LD check.

## Italian

| Site | Reachable | robots `/` | Sitemap | ~Recipe URLs | JSON-LD | Verdict |
|---|---|---|---|---|---|---|
| recipesfromitaly.com | yes | allow | `/sitemap_index.xml` | ~539 | yes (2/3) | **KEEP** |
| memoriediangelina.com | no — HTTP 202 (bot-challenge) on every plain GET | n/a | none | — | — | DROP — bot-challenge |
| giallozafferano.com (English edition) | yes | allow | `/sitemap/recipes.xml` (recipe-only sitemap) | ~7,750 | yes (3/3) | **KEEP** |
| anitalianinmykitchen.com | yes | allow | `/sitemap.xml` → 2 post-sitemaps | ~1,276 | yes (2/3) | **KEEP** |
| pinabresciani.com | yes | allow | `/sitemap_index.xml` | ~222 | yes (2/3) | **KEEP** |

## French

| Site | Reachable | robots `/` | Sitemap | ~Recipe URLs | JSON-LD | Verdict |
|---|---|---|---|---|---|---|
| thefrenchcookingacademy.com | yes | allow | `/sitemap.xml` (flat) | ~982 (site total) | no — checked `/recipes`, `/recipes/provencal-baked-fish`, `/store`; the recipe page's LD is `Article`/`LocalBusiness`/`Organization` only, no `Recipe` type | DROP — no schema.org Recipe markup |
| pardonyourfrench.com | yes | allow | `/sitemap_index.xml` | ~410 | yes (2/3) | **KEEP** |
| lechefswife.com | no — 403 on homepage and articles | allow | found, ~227 | fetch failed (403) | n/a | DROP — WAF/bot-block |
| chocolateandzucchini.com | yes (redirects to `cnz.to`) | allow | `/sitemap_index.xml` | ~1,482 | no (3/3 `/recipes/...` pages checked) | DROP — no Recipe markup found |
| eatlivetravelwrite.com (Les Petits Chefs / Mardi Michels) | yes | n/a (no robots.txt) | none found | — | no | DROP — no sitemap or Recipe markup found |
| traditionalfrenchfood.com | yes | n/a (no robots.txt) | none found (site predates sitemaps; only stale RSS-aggregator links on the homepage) | — | no | DROP — no usable URL discovery, no Recipe markup |
| myparisiankitchen.com | yes | allow | `/sitemaps.xml` → `post-sitemap1.xml` | ~451 | yes (3/3) | **KEEP** |

Only 2 kept (pardonyourfrench.com, myparisiankitchen.com) out of 7 candidates checked —
flagged as an open item below.

## Mediterranean (Palestinian / Greek / Egyptian / Persian — R16 excludes Israeli)

| Site | Sub-cuisine | Reachable | robots `/` | Sitemap | ~Recipe URLs | JSON-LD | Verdict |
|---|---|---|---|---|---|---|---|
| mygreekdish.com | Greek | yes | allow | `/sitemap_index.xml` | ~249 | yes (3/3) | **KEEP** |
| dimitrasdishes.com | Greek | yes | allow | `/sitemap.xml` → 2 post-sitemaps | ~1,182 | yes (2/3) | **KEEP** |
| themediterraneandish.com | Greek/Egyptian-American, general Mediterranean | no — 403 on homepage and articles | allow | found, ~1,399 | fetch failed (403) | n/a | DROP — WAF/bot-block |
| amiraspantry.com | Egyptian | no — 403 on homepage and articles | allow | found, ~937 | fetch failed (403) | n/a | DROP — WAF/bot-block |
| cheznermine.com | Egyptian | yes | allow | `/sitemap.xml` (custom, image/video sub-sitemaps too) | ~495 | no (3/3) | DROP — no Recipe markup found |
| thematbakh.com | Egyptian | yes | allow | `/sitemap.xml` | ~259 | yes (2/3, `easy-ground-lamb-shepherds-pie/`, `baked-stuffed-kibbeh/`) | **KEEP** |
| unicornsinthekitchen.com | Persian | no — 403 on homepage and articles | allow | found, ~833 | fetch failed (403) | n/a | DROP — WAF/bot-block |
| mypersiankitchen.com | Persian | no — 403 | — | — | — | — | DROP — WAF/bot-block |
| familyspice.com | Persian | no — 403 on homepage | allow | found (empty body on request) | — | — | DROP — WAF/bot-block |
| persianmama.com | Persian | no — HTTP 202 (bot-challenge) | n/a | none | — | — | DROP — bot-challenge |
| persianpot.com | Persian | yes | allow | `/sitemap_index.xml` → dedicated `recipe-sitemap.xml` | ~50 | no — `recipe-sitemap.xml` URLs resolve, but the page's own LD-JSON is `WebPage`/`WebSite` only (and is itself malformed: raw control characters break strict JSON parsing) | DROP — sitemap exists but no Recipe type in the LD |
| palestineinadish.com | Palestinian | yes | allow | `/sitemap_index.xml` | ~185 | yes (2/3, `banana-date-smoothie-.../`, `fattoush-salad-.../`) | **KEEP** |
| chefindisguise.com | Palestinian | yes | allow | `/sitemap.xml` (flat) | ~649 | no (3/3 checked, including a 2023 and two 2011 posts) | DROP — no Recipe markup found |

4 kept overall (mygreekdish, dimitrasdishes, thematbakh, palestineinadish), meeting "at least 3"
for the Mediterranean bucket, covering Greek/Egyptian/Palestinian. **No working Persian site
was found this pass** — every Persian candidate checked (unicornsinthekitchen, mypersiankitchen,
familyspice, persianmama, persianpot) is either WAF-blocked, bot-challenged, or has no
schema.org Recipe markup. Flagged as an open item below. No Israeli site was checked or kept
(R16).

## Summary: kept sites by cuisine

| Cuisine | Kept sites | Count |
|---|---|---|
| indian | indianhealthyrecipes, hebbarskitchen, archanaskitchen | 3 |
| chinese | thewoksoflife, chinasichuanfood, omnivorescookbook | 3 |
| korean | koreanbapsang, beyondkimchee, kimchimari | 3 |
| japanese | chopstickchronicles, recipetinjapan, pickledplum | 3 |
| malaysian | malaysianchinesekitchen, nyonyacooking, cookwithipohbunny | 3 |
| singaporean | rotinrice, singaporeanmalaysianrecipes | **2** (open item) |
| italian | recipesfromitaly, giallozafferano, anitalianinmykitchen, pinabresciani | 4 |
| french | pardonyourfrench, myparisiankitchen | **2** (open item) |
| mediterranean | mygreekdish, dimitrasdishes, thematbakh, palestineinadish | 4 |

26 sites kept in `ingest/fetch/sites.yaml`, out of 58 candidates checked.
