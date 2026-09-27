Builder ingest/tag, slice S5a. Hash: the commit that adds this file, on branch
worktree-agent-ac88c60b9a166d321 (cut from f3a02b6 = claude/funny-thompson-jcmpox HEAD). Nothing pushed.
The gold set and scorer were committed on their own first (e9a5b3a), before the tagger existed.

- Changed (all new, in `ingest/tag/`):
  - `tagger.py`: `tag_recipe(raw, items=None)` returns a tags dict: diet, equipment,
    equipment_alternatives, stove_and_oven, one_pot, one_pan, sheet_pan_meal, time, and
    undeterminable (a reason per tag).
  - `diet.py`: vegetarian and no_red_meat (R7/R8), plus vegetarian_strict kept internal. Each
    returns `ok`, `adaptable`, `no` or `unknown`, with `swaps` and `blockers`. A way out is one of:
    an alternative in the line that resolves to a safe slug; an ingest/subs substitution with
    quality >= 2 whose context fits (found on the item's slug or a taxonomy ancestor); or an item
    the line marks optional or garnish. The title is never read for diet. An unresolved item that
    names a meat or fish offends. A meat the steps add but the list lacks ("Add chicken pieces")
    also offends.
  - `equipment.py`: the brief's 23 tags plus 9 the data shows (steamer, toaster, toaster_oven,
    ice_cream_maker, bread_machine, waffle_iron, sous_vide, dehydrator, campfire). It also
    derives stove_and_oven, and counts vessels for one_pot, one_pan and sheet_pan_meal.
  - `timing.py`: total and active minutes. They come from the source fields, or are estimated
    from step durations plus a prep allowance. `source` records which, and weeknight means a
    total of 30 minutes or less.
  - `gold/gold.jsonl` holds 150 hand-labelled recipes from 8 sources, including 45 planted or
    targeted ones. `gold/holdout.jsonl` holds 30 more, labelled after tuning and scored once.
    `gold/score.py` has the bars, written before the first run. `run_corpus.py` writes
    `COVERAGE.md`, and `test_tag.py` holds 37 tests.
- Checks:
  - pytest: ingest/tag 37 passed, 0 failed. All of ingest: 245 passed, 0 failed (3.2 s). There
    is no typecheck or lint configured for ingest.
  - Gold, first run: diet 96.0% (288/300 decisions), diet traps 87.5% (21/24), one_pot 79.8%
    (99/124). Oven P 89.1% R 100%, stovetop P 94.9% R 100%, air_fryer 100/100, food_processor
    P 94.4% R 100%, blender 100/100, mortar_pestle 100/100. Bars FAILED on diet, diet traps, oven
    precision and one_pot.
  - Gold, final run: diet 99.7% (299/300), diet traps 100% (24/24), one_pot 93.5% (116/124).
    The six bar tools score 100% precision and 100% recall: oven 41, stovetop 74, air_fryer 8,
    food_processor 17, blender 12, mortar_pestle 6. BARS PASSED.
  - Holdout (30 recipes, scored once after tuning): diet 96.7% (58/60), one_pot 93.1% (27/29),
    oven P/R 100/100 (16), stovetop P 100% R 93.3%. The honest estimate for unseen recipes is
    between the first run and the holdout. I tuned against the gold misses, so the final gold
    figure is optimistic.
  - One gold label changed after the first run. Recipe #131 ("1 can onion soup") went from
    adaptable/adaptable to no/no, because canned French onion soup is beef-stock based and the
    taxonomy is right. On the original labels that first run would have scored 96.7%.
  - 20k run: 20,000 recipes tagged, 0 failed, 0 timeouts (5 s alarm each), in 67 s. Output is at
    /home/user/recipe-data/derived/tags_sample.jsonl, outside git. The sample takes every
    recipe of each source under 5,000 recipes, and 5,319 each from hf_cuisine_type, openrecipes
    and recipenlg.
    - Vegetarian: ok 57.4%, adaptable 5.6%, no 28.5%, unknown 8.5%.
    - No red meat: ok 71.2%, adaptable 6.3%, no 13.9%, unknown 8.5%.
    - Equipment: stovetop 24.5%, oven 20.8%, no_cook 7.5%, sheet_pan 6.4%, food_processor 3.0%,
      blender 2.6%, mortar_pestle 0.3%, air_fryer 0.2%.
    - stove_and_oven true 8.9%. one_pot true 24.9%, false 20.8%, null 54.3%.
    - Time source: source 29.8%, estimated 28.9%, partial 3.6%, none 37.6%. Weeknight true 23.1%.
  - Undeterminable counts, with reasons:
    - No equipment found: 10,802 have no steps (hf_cuisine_type 5,319 and openrecipes 5,319
      carry no steps at all; foodwishes 167). 43 more have truncated steps.
    - No time: 6,780 have no time fields and no steps. 749 have steps but no durations.
    - Diet unknown: 1,704 have no readable ingredient (1,698 of them are openrecipes lines whose
      names were lost, e.g. "1 cup 1 cup"). 5 have no ingredient lines.
- Outside my package: only `orch/reports/S5a.md`. Nothing in ingest/parse, ingest/taxonomy or
  ingest/subs was edited. These fixes are for their owners:
  - taxonomy: `frog_legs` inherits red_meat through parent `meat`. It is the one gold diet miss
    left, since frog is not red meat.
  - subs: there is no target for the generic `stock`, and none for `chicken`, `cooked_chicken`
    or `cream_of_chicken_soup`. `chicken` and `cooked_chicken` are the 4th and 11th most common
    vegetarian blockers. I read `stock` through chicken_stock's entries as a local mirror
    (`diet.PROXY_TARGET`) until subs gains a stock target.
  - parser: "crab brown and white meat" resolves to `meat`, and the tagger works around it. "1
    clove 1 clove" resolves to `cloves`. "1 roast" is unresolved, and that is a holdout miss.
  - fetch: openrecipes has lost ingredient names on about 32% of the sampled records.
    foodwishes steps are fragments. foodcom ingredient lists drop lines, e.g. scrapple lists no
    pork. Sources grew while I worked (bbcgoodfood went from 1,175 to 1,718, and hf_cuisine_type
    is new), so COVERAGE.md counts sizes at run time.
- Design was wrong about: nothing in the brief is false. Two notes:
  - "Lard (not ok for no_red_meat)" can come out `adaptable`, not `no`. The subs table has a
    quality-2 lard swap for baking and frying (butter, shortening), so lard pastry is
    adaptable, and lard in a simmered dish is `no`. Both cases are tested.
  - "Food processor or blender" tags both, and records the pair in `equipment_alternatives`.
    The app can then treat either one as enough.
- Open: one_pot is literal ("a single cooking vessel"), so cookies on one baking sheet count as
  one_pot. My recommendation is to keep the tag literal, and let the app's "one pot meals"
  filter AND it with a savoury-main course tag once S5b or corpus has one. The alternative,
  narrowing one_pot in the tagger, would mix a course judgement into an equipment tag.

Five tagged recipes, verbatim (tags only, with title; random.Random(11) over the 20k output):

```
{"title": "Fajita-style pasta", "id": "bbcgoodfood:fajita-style-pasta", "tags": {"diet": {"vegetarian": {"status": "adaptable", "swaps": [{"item": "skinless chicken breasts cut into strips", "slug": "chicken_breast", "use": "seitan", "use_slug": ["seitan"], "via": "substitution", "sub_id": "chicken_breast__seitan", "quality": 2}]}, "no_red_meat": {"status": "ok"}, "vegetarian_strict": {"status": "adaptable", "swaps": [{"item": "skinless chicken breasts cut into strips", "slug": "chicken_breast", "use": "seitan", "use_slug": ["seitan"], "via": "substitution", "sub_id": "chicken_breast__seitan", "quality": 2}, {"item": "grated parmesan or cheddar", "slug": "parmigiano_reggiano", "use": "cheddar", "use_slug": "cheddar", "via": "alternative"}]}}, "equipment": ["dutch_oven", "stovetop"], "equipment_alternatives": [], "stove_and_oven": false, "one_pot": true, "one_pan": false, "sheet_pan_meal": false, "time": {"total_min": 35, "active_min": 10, "source": "source", "weeknight": false, "reason": null}, "undeterminable": {"equipment": null, "time": null, "diet": null}}}
{"title": "Piri-piri chicken and slaw", "id": "themealdb:53039", "tags": {"diet": {"vegetarian": {"status": "no", "blockers": [{"item": "Chicken", "slug": "chicken"}]}, "no_red_meat": {"status": "ok"}, "vegetarian_strict": {"status": "no", "blockers": [{"item": "Chicken", "slug": "chicken"}]}}, "equipment": ["food_processor", "oven"], "equipment_alternatives": [], "stove_and_oven": false, "one_pot": true, "one_pan": true, "sheet_pan_meal": false, "time": {"total_min": 180, "active_min": 20, "source": "estimated", "weeknight": false, "reason": null}, "undeterminable": {"equipment": null, "time": null, "diet": null}}}
{"title": "Layered Pumpkin Dessert", "id": "recipenlg:1530438", "tags": {"diet": {"vegetarian": {"status": "ok"}, "no_red_meat": {"status": "adaptable", "swaps": [{"item": "unflavored gelatin", "slug": "gelatin", "use": "fish gelatin", "use_slug": ["fish_gelatin"], "via": "substitution", "sub_id": "gelatin__fish_gelatin", "quality": 2}]}, "vegetarian_strict": {"status": "no", "blockers": [{"item": "unflavored gelatin", "slug": "gelatin"}]}}, "equipment": ["hand_mixer", "oven", "stovetop"], "equipment_alternatives": [], "stove_and_oven": true, "one_pot": false, "one_pan": false, "sheet_pan_meal": false, "time": {"total_min": 282, "active_min": 21, "source": "estimated", "weeknight": false, "reason": null}, "undeterminable": {"equipment": null, "time": null, "diet": null}}}
{"title": "Mai Tai Dessert", "id": "foodcom:000880", "tags": {"diet": {"vegetarian": {"status": "ok"}, "no_red_meat": {"status": "adaptable", "swaps": [{"item": "gelatin", "slug": "gelatin", "use": "fish gelatin", "use_slug": ["fish_gelatin"], "via": "substitution", "sub_id": "gelatin__fish_gelatin", "quality": 2}]}, "vegetarian_strict": {"status": "no", "blockers": [{"item": "gelatin", "slug": "gelatin"}]}}, "equipment": ["stovetop"], "equipment_alternatives": [], "stove_and_oven": false, "one_pot": true, "one_pan": false, "sheet_pan_meal": false, "time": {"total_min": 799, "active_min": 14, "source": "estimated", "weeknight": false, "reason": null}, "undeterminable": {"equipment": null, "time": null, "diet": null}}}
{"title": "Chocolate Chip Sour Cream Pancakes", "id": "openrecipes:51716e0696cc620aff99733c", "tags": {"diet": {"vegetarian": {"status": "ok"}, "no_red_meat": {"status": "ok"}, "vegetarian_strict": {"status": "ok"}}, "equipment": [], "equipment_alternatives": [], "stove_and_oven": null, "one_pot": null, "one_pan": null, "sheet_pan_meal": null, "time": {"total_min": null, "active_min": null, "source": null, "weeknight": null, "reason": "no time fields and no steps"}, "undeterminable": {"equipment": "no steps", "time": "no time fields and no steps", "diet": null}}}
```

A defect the 20k run caught, now fixed and tested: "5kg boneless gammon joint (smoked or
unsmoked depending on your preference)" was tagged vegetarian-adaptable. The unreadable
alternative "unsmoked ..." had been taken as safe. An alternative must now resolve to a safe slug.
