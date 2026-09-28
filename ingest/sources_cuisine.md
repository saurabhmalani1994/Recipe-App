# Cuisine-specialist sources (slice S17; browser mode + more sites: S17b)

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

## Summary: kept sites by cuisine (S17, before S17b)

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

## S17b: browser mode for the WAF-blocked sites, Persian, and more Singaporean/French

S17 found ten sites unreachable to a plain HTTP client: vegrecipesofindia.com, maangchi.com,
mykoreankitchen.com, justonecookbook.com, rasamalaysia.com, themediterraneandish.com,
amiraspantry.com, unicornsinthekitchen.com, familyspice.com (all 403 WAF-blocks) and
redhousespice.com. This slice added a `fetch: browser` mode to `fetch_sites.py` (headless
Chromium via Playwright, one browser context per site, 1 page/2s, `--ignore-certificate-errors`
because this sandbox's outbound proxy's own CA isn't one Chromium trusts by default) and tried
each of those ten plus redhousespice.com and the open Persian/Singaporean/French items again,
each on 3 real recipe pages (or the homepage first, where that was as far as the site got).

| Site | Browser reachable | Result | Verdict |
|---|---|---|---|
| vegrecipesofindia.com | no | homepage: 403, interactive CAPTCHA page every time | DROP — bot challenge |
| maangchi.com | no | homepage: 403, interactive CAPTCHA page every time | DROP — bot challenge |
| mykoreankitchen.com | homepage only | homepage: 200 (once); all 3 sampled recipe pages: 403, CAPTCHA, 3 attempts each | DROP — bot challenge |
| justonecookbook.com | yes | 3/3 sampled recipe pages parsed clean (smoked-baby-back-ribs, melon-pan, oyaki); cap-20 smoke test: 20/20 written, 0 fetch failures, 0 bot-challenge drops | **KEEP** (browser mode) |
| rasamalaysia.com | no | homepage: 403, CAPTCHA | DROP — bot challenge |
| themediterraneandish.com | no | homepage: 403, CAPTCHA | DROP — bot challenge |
| amiraspantry.com | no | homepage: 403, CAPTCHA | DROP — bot challenge |
| unicornsinthekitchen.com | no | homepage: 403, CAPTCHA | DROP — bot challenge |
| familyspice.com | no | homepage: 403, CAPTCHA | DROP — bot challenge |
| redhousespice.com | no | homepage: 403, CAPTCHA | DROP — bot challenge |

Only justonecookbook.com is reachable even with a real browser; the other nine return a genuine
interactive challenge page (Cloudflare/PerimeterX-style, "CAPTCHA"/"checking your browser"
markers), consistently across 2-3 attempts each with a fresh context, and per the brief those
are left alone rather than defeated. justonecookbook.com's own sitemap.xml also 403s to a plain
`requests` GET and, oddly, to a plain browser `page.content()` read too: Yoast serves a human-
readable HTML table (not raw `<loc>` XML) at the same URL for a full-browser `Accept` header,
which the first version of this slice's `sitemap_locs()` didn't handle (it fell back to a
homepage-link crawl, which still worked but found far fewer URLs); `sitemap_locs()` now also
falls back to same-host `<a href>` links when no `<loc>` tag is found, so justonecookbook.com's
sitemap discovers its full ~1,400 URLs.

### Persian (S17's open item 2)

Re-checked persianmama.com (still bot-challenged, 2/3 attempts got the CAPTCHA page even with
the browser) and persianpot.com, then searched for more candidates:

| Site | Reachable | JSON-LD | Verdict |
|---|---|---|---|
| persianmama.com | no (browser) | CAPTCHA 2/3 attempts | DROP — bot challenge |
| persianpot.com | yes (plain) | **Bug found**: `totalTime`/`prepTime`/`cookTime` are a one-item list of free text (`["25 min"]`), not a string; crashed `_iso_duration_to_min()` with `AttributeError` on every page that had a Recipe block. Fixed (coerce with the existing `_first()` helper before parsing); covered by `test_fetch_sites_duration_list_coerced`. After the fix: 7/9 sample pages parsed (2 sampled pages, `lubia-polo` and `stuffed-eggplant`, are on the recipe sitemap but carry no Recipe LD at all — a genuine no-schema page, not a bug) | **KEEP** (plain, with the fix) |
| thepersianfusion.com | "yes" (200) but the domain is dead/hijacked — its sitemap.xml 301-redirects to `alphakappapsi.org`, a gambling-spam site with no relation to the original blog | n/a | DROP — domain hijacked |
| bottomofthepot.com | yes (plain, with an `Accept: text/html,...` header — a plain `curl`/`requests` default gets a 406 from its ModSecurity rule) | no — 4/4 sampled posts (narrative essays with embedded recipes) carry no `Recipe` LD block at all | DROP — no schema.org Recipe markup |
| faeskitchen.com | partially — its `/sitemap.xml` only lists its own homepage (a broken/placeholder sitemap) and the rendered homepage has no server-side links (client-rendered), so no usable URL list was found in the time budget | n/a | DROP — no usable URL discovery found |
| thespicespoon.com | yes (plain) | 4/4 sampled recipe pages parsed clean (tahdig, khoresh-e-portaghal, borani-esfanaj, mirza-ghasemi) | **KEEP** (plain) |
| cookingwithsamira.com | yes (plain) | 3/3 sampled recipe pages parsed clean (zereshk-polo, kookoo-sabzi, baghali-polo) | **KEEP** (plain) |
| turmericsaffron.com, aashpazi.com, persianfoodtour.com, zabzicooks.com, chelokebab.com | no — DNS/TLS/proxy failures on every attempt (dead or unroutable domains), 2 attempts each | n/a | DROP — unreachable |

Three Persian sites kept: persianpot.com, thespicespoon.com, cookingwithsamira.com — meets the
"at least 2" ask with one to spare.

### Singaporean (S17's open item 1, partial)

| Site | Reachable | JSON-LD | Verdict |
|---|---|---|---|
| greedygirlgourmet.com | yes (plain) | 4/4 sampled recipe pages parsed clean (congee, Chinese ribs, sambal mayo, Hainanese chicken porridge) | **KEEP** (plain) |
| mysingaporefood.com | yes (plain) | no — 4/4 sampled `/recipe/...` pages carry only `WebPage`/`ImageObject`/`BreadcrumbList`/`WebSite` in their `@graph`, no `Recipe` node | DROP — no schema.org Recipe markup |
| islifearecipe.net | yes (plain) | not checked in depth — its sitemap mixes Estonia restaurant reviews with recipes, i.e. not a Singapore-specific site, so deprioritized in the time budget | — | DROP — not cuisine-specific |
| delishar.com | reachable (302 redirect) | not checked — deprioritized once greedygirlgourmet.com (a 3rd site) was confirmed | — | not checked |

Singaporean now has 3 kept sites (rotinrice, singaporeanmalaysianrecipes, greedygirlgourmet),
closing S17's open item.

### French (S17's open item 1, not closed)

Checked simplefrenchcooking.com (proxy/connection failure, 2 attempts), everydayfrenchchef.com,
traditionalfrenchfood.com and easy-french-food.com (all reachable, but none carries any
`application/ld+json` block at all on their homepage or robots.txt-listed pages — old-style
sites with no schema.org markup, predating recipe-card plugins) and lechefswife.com (still
403, unchanged from S17). No new French site found; French stays at 2 kept sites
(pardonyourfrench.com, myparisiankitchen.com). This item is left open for a future pass — see
Open below.

## Summary: kept sites by cuisine (after S17b)

| Cuisine | Kept sites | Count |
|---|---|---|
| indian | indianhealthyrecipes, hebbarskitchen, archanaskitchen | 3 |
| chinese | thewoksoflife, chinasichuanfood, omnivorescookbook | 3 |
| korean | koreanbapsang, beyondkimchee, kimchimari | 3 |
| japanese | chopstickchronicles, recipetinjapan, pickledplum, justonecookbook (browser) | 4 |
| malaysian | malaysianchinesekitchen, nyonyacooking, cookwithipohbunny | 3 |
| singaporean | rotinrice, singaporeanmalaysianrecipes, greedygirlgourmet | 3 |
| italian | recipesfromitaly, giallozafferano, anitalianinmykitchen, pinabresciani | 4 |
| french | pardonyourfrench, myparisiankitchen | **2** (open item, unchanged) |
| mediterranean (incl. persian) | mygreekdish, dimitrasdishes, thematbakh, palestineinadish, persianpot, thespicespoon, cookingwithsamira | 7 |

31 sites kept in `ingest/fetch/sites.yaml` (26 from S17 + 5 from S17b), out of 58 + ~24 = ~82
candidates checked across both slices.
