# Brief S17: find and verify cuisine-specialist recipe sites (ingest, survey + fetcher)
From the orchestrator. Owner, verbatim (D19): "also find sites that do good indian cooking, chinese cooking, korean
cooking, japanese cooking, malaysian cooking, singaporean cooking, italian cooking, french cooking,
mediterranean cooking - no israeli food only palestinian/greek/egyptian/persian". Also D17 (not
Southern or Midwest US, no Cool Whip or sour-cream style) and D18 (fresh ingredients). Ruling R16
covers the exclusion.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/fetch/` (a new generic site fetcher and a
sites registry); do not edit the bbcgoodfood or foodwishes fetchers (other runs own them).
Model: mid. Effort: high.

Deliverable:
1 Candidate list, at least 3 per cuisine, from well-regarded cooks writing that cuisine. Examples
  to check, not settled:
  - Indian: indianhealthyrecipes.com (Swasthi), vegrecipesofindia.com, hebbarskitchen.com,
    archanaskitchen.com
  - Chinese: thewoksoflife.com, redhousespice.com, chinasichuanfood.com, omnivorescookbook.com
  - Korean: maangchi.com, mykoreankitchen.com, koreanbapsang.com
  - Japanese: justonecookbook.com, chopstickchronicles.com, japanesecooking101.com
  - Malaysian: rasamalaysia.com, malaysianchinesekitchen.com, nyonyacooking.com
  - Singaporean: noobcook.com, rotinrice.com, and others you find
  - Italian: recipesfromitaly.com, memoriediangelina.com, the English edition of giallozafferano
  - French: frenchcookingacademy.com, pardonyourfrench.com, and others
  - Palestinian, Greek, Egyptian, Persian: mygreekdish.com, dimitrasdishes.com, themediterraneandish.com,
    amiraspantry.com, unicornsinthekitchen.com, mypersiankitchen.com, and Palestinian cooks you can find
  Exclude Israeli-cuisine sites (R16).
2 For each candidate, check: reachable, whether robots.txt allows /, the sitemap URL and its count
  of recipe URLs, and whether 3 sample pages carry schema.org Recipe JSON-LD. Write
  `ingest/sources_cuisine.md` (one row per site with these facts and a keep/drop reason) and
  `ingest/fetch/sites.yaml` (the kept sites, each with its cuisine label and URL pattern).
3 `ingest/fetch/fetch_sites.py`: a generic, resumable sitemap plus JSON-LD fetcher that reuses
  sitemap_crawler.py. It is polite: 1 request per second per site, a 20 s timeout, and robots.txt
  respected. Output is the raw_recipe format with source = the site id and cuisine_label from
  sites.yaml. It applies R16 at fetch time (drop, with the reason counted). It has
  `--site`, `--cap` and `--retry-failed`.
4 Run each kept site with --cap 30 as a smoke test. Report written and dropped counts per site,
  each with a reason. Do NOT run full crawls; the orchestrator runs them as background scripts.
Checks: pytest for the JSON-LD shapes seen (a fixture per site family, e.g. WPRM, Tasty
Recipes, custom). Report per §6 plus the site table.
