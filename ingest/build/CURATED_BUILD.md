# corpus.db, the S10 full rebuild

Built by slice S10 from the S10 curation (scan -> rank -> build). The generated build report
follows the summary.

## Summary

- File: `/home/user/recipe-data/out/corpus.db`, 227,815,424 bytes (227.8 MB), **64,225 recipes**,
  schema_version 3.
- The size cap sets the count, not the 80k target. The first S10 build took the 80,000-recipe
  selection and came out at 287.5 MB with 79,998 recipes, over the 235 MB cap. That build is
  kept at `/home/user/recipe-data/derived/corpus_s10_80k_uncapped.db`. The cap is now in code:
  `ingest/curate/select.py` BYTE_BUDGET is 97% of 235 MB, and `est_bytes` was fitted on that
  build. The selection settled at 64,227 recipes (estimate 227.4 MB). The build wrote 64,225,
  because R16 dropped 2 more at build time (see Drops).
- Do editorial and site recipes push the total above 80k? No. They make up 29,170 of the
  selection. With the cuisine floors (20,536) they fill 49,706 slots, well under 80k, and score
  picks fill the rest. What pushed the corpus down was size, not count. Editorial and site
  recipes carry long methods, and so do the recipenlg picks that S8b's method term favours, at
  about 3.5 KB per recipe (recipenlg 3.8 KB). Under the cap, the score-picked recipenlg share
  falls from 76,712 (S8b) to 35,055. Every editorial, site and floor recipe stays.
- Whole sources: every recipe of bbcgoodfood, themealdb, foodwishes and the 32 cuisine sites
  that passed the junk filters and the dedupe. A new junk filter, `curate_junk_unparsed`,
  removes a whole-source recipe when under half of its ingredient lines resolve. It drops 850,
  most of them non-English: archanaskitchen 393 (Hindi pages), myparisiankitchen 370 (French
  pages, 24 of 394 left), pardonyourfrench 50 (the whole ingredient list served as one
  run-together line), hebbarskitchen 22 (Hindi), bbcgoodfood 8, thewoksoflife 3, foodwishes 2,
  justonecookbook 1, themealdb 1.
- R16: 383 dropped as `excluded_israeli`. Curation dropped 381 of them, on the title for recipenlg
  (378) and on the full check at scan for bbcgoodfood (2, `sabich` and a stew tagged
  "israeli couscous") and foodwishes (1, "Israeli Couscous 'Cheese'..."). The build dropped 2
  more selected recipenlg recipes, `recipenlg:1439319` and `recipenlg:1959430`. recipenlg's `tags`
  field is its NER ingredient list, and it names "Israeli arugula" and "Israeli couscous".
- R17: 1,038 Food Wishes recipes, all with a `video_url`. That is 988 YouTube, 45 Vimeo, and 5
  post pages whose embed is Brightcove or another player. 725 of them have no steps rows, so
  their method is the video. Of the 743 raw recipes with no steps, 1 was dropped `no_steps` (its
  post embeds no video at all). The rest fell to the same junk and duplicate filters as every
  other recipe.
- R18: the floor bar is the pool's 25th percentile, score 0.493. Only fusion_other reached below
  it, and it now keeps 290 of the 451 available (161 declined). S8b's Cool Whip salads came in this
  way. The lowest recipe kept is now `foodwishes:2011/03/homemade-creme-fraiche-nobodys-ever` at
  0.195, a whole-source pick, not a floor pick.
- Cuisine sites: 16,376 recipes from 32 sites. Every site's label maps through `cuisines.yaml`
  `site_labels` and is taken as `cuisine_source = 'source_label'`: palestinian becomes
  middle_eastern (sub-label palestinian), egyptian becomes north_african (sub egyptian),
  malaysian and singaporean become indonesian_malaysian (subs malaysian and singaporean), and
  persian, greek and the other labels map to themselves. The Mediterranean sites give greek
  1,287, persian 199, north_african 242 and middle_eastern 135.

## Raw line counts this build was drawn from

The selection was drawn from the scan pins, in the first column, which is what a rebuild must
refresh. `build_sources.lines_total` pins the file length when the build opened each source, and
the build read only selected lines below the scan pin. Crawls still running during S10: bbcgoodfood
(retry), archanaskitchen, giallozafferano (both now at their --cap 5000), justonecookbook and
dimitrasdishes.

To rebuild once the crawls finish, run each step foreground, under `timeout`, and repeat until it
reports complete:

    python3 -m ingest.curate.scan --refresh-grown --budget 540       # rescans only the grown sources
    python3 -m ingest.curate.rank --compare /home/user/recipe-data/derived/curate/s8b
    python3 -m ingest.build.build_corpus --select /home/user/recipe-data/derived/curate/selection.tsv \
        --out /home/user/recipe-data/out/corpus.next.db --fresh --stop-after 34000   # then without --fresh
    # then move corpus.next.db over corpus.db and regenerate this report (build_corpus.report)

More site recipes shrink the recipenlg share under the byte budget. They do not grow the file.

| source | scanned (manifest pin) | at build (build_sources) | now | grew since scan |
|---|---:|---:|---:|---:|
| anitalianinmykitchen | 1,246 | 1,246 | 1,246 | +0 |
| archanaskitchen | 3,403 | 5,000 | 5,000 | +1,597 |
| bbcgoodfood | 11,249 | 13,921 | 15,466 | +4,217 |
| beyondkimchee | 358 | 358 | 358 | +0 |
| chinasichuanfood | 692 | 692 | 692 | +0 |
| chopstickchronicles | 333 | 333 | 333 | +0 |
| cookingwithsamira | 62 | 62 | 62 | +0 |
| cookwithipohbunny | 113 | 113 | 113 | +0 |
| dimitrasdishes | 1,068 | 1,086 | 1,086 | +18 |
| foodcom | 1,228 | - | 1,228 | +0 |
| foodwishes | 1,084 | 1,084 | 1,084 | +0 |
| giallozafferano | 1,749 | 4,660 | 5,000 | +3,251 |
| github_cookdiary | 0 | - | 0 | +0 |
| github_gomp | 0 | - | 0 | +0 |
| github_openrecipe | 2 | - | 2 | +0 |
| github_recipegen | 5 | - | 5 | +0 |
| greedygirlgourmet | 280 | 280 | 280 | +0 |
| hebbarskitchen | 1,087 | 1,087 | 1,087 | +0 |
| hf_cuisine_type | 34,348 | - | 34,348 | +0 |
| indianhealthyrecipes | 65 | 65 | 65 | +0 |
| justonecookbook | 50 | 660 | 860 | +810 |
| kimchimari | 247 | 247 | 247 | +0 |
| koreanbapsang | 253 | 253 | 253 | +0 |
| malaysianchinesekitchen | 117 | 117 | 117 | +0 |
| mygreekdish | 235 | 235 | 235 | +0 |
| myparisiankitchen | 394 | 394 | 394 | +0 |
| nyonyacooking | 20 | 20 | 20 | +0 |
| omnivorescookbook | 723 | 723 | 723 | +0 |
| openrecipes | 168,442 | - | 168,442 | +0 |
| palestineinadish | 136 | 136 | 136 | +0 |
| pardonyourfrench | 336 | 336 | 336 | +0 |
| persianpot | 9 | 9 | 9 | +0 |
| pickledplum | 744 | 744 | 744 | +0 |
| pinabresciani | 208 | 208 | 208 | +0 |
| recipenlg | 2,231,142 | 2,231,142 | 2,231,142 | +0 |
| recipesfromitaly | 521 | 521 | 521 | +0 |
| recipetinjapan | 428 | 428 | 428 | +0 |
| rotinrice | 689 | 689 | 689 | +0 |
| singaporeanmalaysianrecipes | 145 | 145 | 145 | +0 |
| thematbakh | 243 | 243 | 243 | +0 |
| themealdb | 790 | 790 | 790 | +0 |
| thespicespoon | 133 | 133 | 133 | +0 |
| thewoksoflife | 1,358 | 1,358 | 1,358 | +0 |

## 10 random titles, verbatim (random.Random(10) over all recipes)

- "Scandinavian Stuffing" (recipenlg, german_central_eu, side) `recipenlg:1415147`
- "Orange And Pomegranate Salad Recipe With Candied Almonds" (archanaskitchen, indian, side) `archanaskitchen:recipe_orange-and-pomegranate-salad-with-candied-almonds`
- "Vietnamese Beef Noodle Soup" (recipenlg, vietnamese, main) `recipenlg:1297568`
- "Pistachio And Almond Cake With Orange Salad" (recipenlg, turkish, dessert) `recipenlg:1353679`
- "Squash Pickle Medley" (recipenlg, indian, sauce_condiment) `recipenlg:1420037`
- "Creamy Mushroom Soup and Parmesan Bread Twists" (anitalianinmykitchen, italian, baking) `anitalianinmykitchen:creamy-mushroom-soup`
- "Grilled peach, chicken & feta salad" (bbcgoodfood, no cuisine, main) `bbcgoodfood:grilled-peach-chicken-feta-salad`
- "Safoi’S Moroccan Chicken Tagine" (recipenlg, north_african, main) `recipenlg:1333087`
- "Vietnamese Summer Rolls" (recipenlg, vietnamese, baking) `recipenlg:1971416`
- "Super Bowl: General Tso'S Chicken Wings" (recipenlg, korean, snack) `recipenlg:1362516`

## Build report (generated by `python3 -m ingest.build.build_corpus --report`)

File: `/home/user/recipe-data/out/corpus.db`, 227,815,424 bytes (227.8 MB), 64,225 recipes, schema_version 3.

| source | lines in file | quota | selected | written | dropped |
|---|---:|---:|---:|---:|---:|
| anitalianinmykitchen | 1,246 | 1238 | 1,238 | 1,238 | 0 |
| archanaskitchen | 5,000 | 2991 | 2,991 | 2,991 | 0 |
| bbcgoodfood | 13,921 | 11070 | 11,070 | 11,070 | 0 |
| beyondkimchee | 358 | 354 | 354 | 354 | 0 |
| chinasichuanfood | 692 | 685 | 685 | 685 | 0 |
| chopstickchronicles | 333 | 331 | 331 | 331 | 0 |
| cookingwithsamira | 62 | 62 | 62 | 62 | 0 |
| cookwithipohbunny | 113 | 90 | 90 | 90 | 0 |
| dimitrasdishes | 1,086 | 1057 | 1,057 | 1,057 | 0 |
| foodwishes | 1,084 | 1038 | 1,038 | 1,038 | 0 |
| giallozafferano | 4,660 | 1736 | 1,736 | 1,736 | 0 |
| greedygirlgourmet | 280 | 256 | 256 | 256 | 0 |
| hebbarskitchen | 1,087 | 1063 | 1,063 | 1,063 | 0 |
| indianhealthyrecipes | 65 | 65 | 65 | 65 | 0 |
| justonecookbook | 660 | 46 | 46 | 46 | 0 |
| kimchimari | 247 | 228 | 228 | 228 | 0 |
| koreanbapsang | 253 | 246 | 246 | 246 | 0 |
| malaysianchinesekitchen | 117 | 112 | 112 | 112 | 0 |
| mygreekdish | 235 | 230 | 230 | 230 | 0 |
| myparisiankitchen | 394 | 24 | 24 | 24 | 0 |
| nyonyacooking | 20 | 20 | 20 | 20 | 0 |
| omnivorescookbook | 723 | 719 | 719 | 719 | 0 |
| palestineinadish | 136 | 135 | 135 | 135 | 0 |
| pardonyourfrench | 336 | 282 | 282 | 282 | 0 |
| persianpot | 9 | 9 | 9 | 9 | 0 |
| pickledplum | 744 | 732 | 732 | 732 | 0 |
| pinabresciani | 208 | 204 | 204 | 204 | 0 |
| recipenlg | 2,231,142 | 35057 | 35,057 | 35,055 | 2 |
| recipesfromitaly | 521 | 520 | 520 | 520 | 0 |
| recipetinjapan | 428 | 426 | 426 | 426 | 0 |
| rotinrice | 689 | 684 | 684 | 684 | 0 |
| singaporeanmalaysianrecipes | 145 | 111 | 111 | 111 | 0 |
| thematbakh | 243 | 242 | 242 | 242 | 0 |
| themealdb | 790 | 686 | 686 | 686 | 0 |
| thespicespoon | 133 | 128 | 128 | 128 | 0 |
| thewoksoflife | 1,358 | 1350 | 1,350 | 1,350 | 0 |

## Drops, with reasons

| source | reason | count | first example |
|---|---|---:|---|
| anitalianinmykitchen | curate_duplicate | 6 | `anitalianinmykitchen:chocolate-crinkle-cookies` |
| anitalianinmykitchen | curate_junk_see_above | 2 | `anitalianinmykitchen:pandoro` |
| archanaskitchen | curate_junk_unparsed | 393 | `archanaskitchen:recipe_moong-dal-idli-dosa-batter-recipe-in-hindi` |
| archanaskitchen | curate_junk_ad_or_link | 11 | `archanaskitchen:recipe_nutella-filled-hand-pies-recipe` |
| archanaskitchen | no_ingredients | 4 | `archanaskitchen:recipe_how-to-make-homemade-tomato-puree` |
| archanaskitchen | curate_junk_see_above | 2 | `archanaskitchen:recipe_no-bake-steamed-bread-pudding` |
| archanaskitchen | curate_duplicate | 1 | `archanaskitchen:recipe_video-recipe-how-to-make-homemade-paneer` |
| archanaskitchen | curate_junk_bad_title | 1 | `archanaskitchen:recipe_berry-focaccia-with-mascarpone-cheese-recipe-italian-bread-topped-with-mixed-berries-and-served-with-sweetened-mascarpone-cheese` |
| bbcgoodfood | curate_junk_see_above | 91 | `bbcgoodfood:how-to-make-polenta` |
| bbcgoodfood | curate_duplicate | 53 | `bbcgoodfood:panettone-2` |
| bbcgoodfood | curate_junk_title_is_ingredient | 16 | `bbcgoodfood:labneh` |
| bbcgoodfood | curate_junk_unparsed | 8 | `bbcgoodfood:cheesy-black-bean-quesadillas` |
| bbcgoodfood | curate_junk_ad_or_link | 7 | `bbcgoodfood:sticky-ginger-skillet-parkin` |
| bbcgoodfood | excluded_israeli | 2 | `bbcgoodfood:lemony-chicken-stew-giant-couscous` |
| bbcgoodfood | no_steps | 2 | `bbcgoodfood:loaded-hot-dogs-with-apple-slaw` |
| beyondkimchee | curate_duplicate | 3 | `beyondkimchee:korean-chicken-and-potato-dumplings` |
| beyondkimchee | curate_junk_see_above | 1 | `beyondkimchee:vegan-kimchi` |
| chinasichuanfood | curate_junk_see_above | 4 | `chinasichuanfood:steamed-sichuan-peppercorn-chicken` |
| chinasichuanfood | curate_duplicate | 1 | `chinasichuanfood:salted-duck-egg` |
| chinasichuanfood | curate_junk_title_is_ingredient | 1 | `chinasichuanfood:chinese-sausages` |
| chinasichuanfood | no_ingredients | 1 | `chinasichuanfood:how-to-fold-dumplings` |
| chopstickchronicles | curate_junk_see_above | 2 | `chopstickchronicles:obento` |
| cookwithipohbunny | curate_junk_see_above | 22 | `cookwithipohbunny:recipe-afghani-omelette` |
| cookwithipohbunny | curate_junk_ad_or_link | 1 | `cookwithipohbunny:recipe-teriyaki-chicken-poke-bowl` |
| dimitrasdishes | curate_junk_ad_or_link | 5 | `dimitrasdishes:almond-palmiers-elephant-ear-pastries` |
| dimitrasdishes | no_steps | 4 | `dimitrasdishes:leftover-lamb-pitas` |
| dimitrasdishes | curate_duplicate | 2 | `dimitrasdishes:homemade-caramel` |
| foodcom | curate_excluded_source | 1,214 | `foodcom:000038` |
| foodcom | curate_junk_ad_or_link | 5 | `foodcom:000587` |
| foodcom | no_ingredients | 5 | `foodcom:000412` |
| foodcom | curate_junk_title_is_ingredient | 3 | `foodcom:000073` |
| foodcom | curate_junk_see_above | 1 | `foodcom:000161` |
| foodwishes | curate_junk_ad_or_link | 28 | `foodwishes:2008/12/chicken-cacciatore-official-recipe-of` |
| foodwishes | curate_duplicate | 6 | `foodwishes:2007/05/grilled-lamb-shoulder-chop-with-fresh` |
| foodwishes | curate_junk_bad_title | 5 | `foodwishes:2007/04/spicy-thai-style-steak-and-rice-noodle` |
| foodwishes | curate_junk_see_above | 2 | `foodwishes:2013/11/turkey-matzo-ball-soup-that-old` |
| foodwishes | curate_junk_unparsed | 2 | `foodwishes:2009/05/potted-plant-ice-cream-cake-giving-mom` |
| foodwishes | curate_junk_title_is_ingredient | 1 | `foodwishes:2012/10/mixed-nuts` |
| foodwishes | excluded_israeli | 1 | `foodwishes:2012/08/israeli-couscous-cheese-it-takes-lot-of` |
| foodwishes | no_steps | 1 | `foodwishes:2009/03/it-takes-some-huevos-to-cook-on-ranch` |
| giallozafferano | curate_junk_title_is_ingredient | 5 | `giallozafferano:recipes_veal-cutlets.html` |
| giallozafferano | no_ingredients | 4 | `giallozafferano:recipes_how-to-cook-en-papillote.html` |
| giallozafferano | curate_junk_ad_or_link | 2 | `giallozafferano:recipes_how-to-clean-cabbage-and-cauliflower.html` |
| giallozafferano | curate_junk_see_above | 2 | `giallozafferano:recipes_canape.html` |
| github_openrecipe | curate_below_cut | 1 | `github_openrecipe:1` |
| github_openrecipe | curate_junk_ad_or_link | 1 | `github_openrecipe:0` |
| github_recipegen | curate_below_cut | 3 | `github_recipegen:清蒸鱼_顶级配方.md` |
| github_recipegen | no_steps | 2 | `github_recipegen:白切鸡_顶级配方_Modern.md` |
| greedygirlgourmet | curate_junk_see_above | 21 | `greedygirlgourmet:a-spicy-bihun-goreng-or-fried-thin-rice-vermicelli-recipe` |
| greedygirlgourmet | curate_duplicate | 1 | `greedygirlgourmet:hong-kong-milk-tea` |
| greedygirlgourmet | curate_junk_ad_or_link | 1 | `greedygirlgourmet:easy-shrimp-poke-bowl` |
| greedygirlgourmet | no_steps | 1 | `greedygirlgourmet:korean-dipping-sauce-for-dumplings` |
| hebbarskitchen | curate_junk_unparsed | 22 | `hebbarskitchen:ghevar-recipe-crispy-porous-ghewar-home` |
| hebbarskitchen | curate_duplicate | 1 | `hebbarskitchen:idli-recipe-soft-idli-idli-rava` |
| hebbarskitchen | curate_junk_ad_or_link | 1 | `hebbarskitchen:how-to-make-idli-without-idli-stand` |
| hf_cuisine_type | no_steps | 34,348 | `hf_cuisine_type:4` |
| justonecookbook | curate_junk_ad_or_link | 2 | `justonecookbook:matsutake-gohan` |
| justonecookbook | curate_junk_see_above | 1 | `justonecookbook:shoyu-ramen` |
| justonecookbook | curate_junk_unparsed | 1 | `justonecookbook:how-to-make-shiraga-negi` |
| kimchimari | curate_junk_see_above | 19 | `kimchimari:easy-pork-bulgogi-spring-rolls` |
| koreanbapsang | curate_junk_see_above | 4 | `koreanbapsang:kimchi-kongnamul-guk-soybean-sprout` |
| koreanbapsang | curate_junk_ad_or_link | 2 | `koreanbapsang:15-korean-soup-recipes` |
| koreanbapsang | curate_duplicate | 1 | `koreanbapsang:dalgona-coffee-whipped-coffee` |
| malaysianchinesekitchen | curate_duplicate | 3 | `malaysianchinesekitchen:chinese-peanut-cookies` |
| malaysianchinesekitchen | curate_junk_ad_or_link | 1 | `malaysianchinesekitchen:nasi-ulam-nyonya-herb-rice` |
| malaysianchinesekitchen | curate_junk_title_is_ingredient | 1 | `malaysianchinesekitchen:salted-eggs` |
| mygreekdish | curate_junk_see_above | 5 | `mygreekdish:recipe_bread-machine-sourdough-bread-recipe` |
| myparisiankitchen | curate_junk_unparsed | 370 | `myparisiankitchen:quatre-quarts-pommes` |
| omnivorescookbook | curate_junk_see_above | 3 | `omnivorescookbook:braised-pork-shank-with-black-beans` |
| omnivorescookbook | curate_junk_ad_or_link | 1 | `omnivorescookbook:hainanese-chicken-rice` |
| openrecipes | no_steps | 168,442 | `openrecipes:5160756b96cc62079cc2db15` |
| palestineinadish | curate_duplicate | 1 | `palestineinadish:recipes_how-to-blanch-almonds` |
| pardonyourfrench | curate_junk_unparsed | 50 | `pardonyourfrench:pork-chops-with-apples-and-cider-sauce` |
| pardonyourfrench | curate_junk_see_above | 4 | `pardonyourfrench:tapenade-sandwich-with-caramelized-bell-peppers` |
| pickledplum | curate_junk_ad_or_link | 8 | `pickledplum:maki-sushi` |
| pickledplum | curate_duplicate | 2 | `pickledplum:cocktail-sauce-recipe` |
| pickledplum | curate_junk_see_above | 2 | `pickledplum:dry-fried-green-beans-recipe` |
| pinabresciani | curate_junk_see_above | 2 | `pinabresciani:vegetarian-pasta-e-piselli` |
| pinabresciani | curate_duplicate | 1 | `pinabresciani:arugula-pesto` |
| pinabresciani | curate_junk_ad_or_link | 1 | `pinabresciani:almond-cake` |
| recipenlg | curate_below_cut | 1,820,963 | `recipenlg:0` |
| recipenlg | curate_duplicate | 351,396 | `recipenlg:2` |
| recipenlg | curate_junk_see_above | 9,857 | `recipenlg:1728` |
| recipenlg | curate_junk_title_is_ingredient | 8,935 | `recipenlg:83` |
| recipenlg | curate_junk_ad_or_link | 4,368 | `recipenlg:174041` |
| recipenlg | excluded_israeli | 380 | `recipenlg:1439319` |
| recipenlg | curate_junk_bad_title | 188 | `recipenlg:232275` |
| recipesfromitaly | curate_duplicate | 1 | `recipesfromitaly:quick-puff-pastry-recipe` |
| recipetinjapan | curate_junk_ad_or_link | 1 | `recipetinjapan:saikyo-yaki-fish-saikyo-miso-marinated-grilled-fish` |
| recipetinjapan | curate_junk_title_is_ingredient | 1 | `recipetinjapan:edamame` |
| rotinrice | curate_duplicate | 2 | `rotinrice:miso-soup` |
| rotinrice | curate_junk_title_is_ingredient | 2 | `rotinrice:salted-eggs` |
| rotinrice | curate_junk_see_above | 1 | `rotinrice:fah-sung-thong-peanut-and-sesame-brittle` |
| singaporeanmalaysianrecipes | curate_junk_ad_or_link | 30 | `singaporeanmalaysianrecipes:pineapple-tarts-recipe-resepi-kuih-tart` |
| singaporeanmalaysianrecipes | curate_junk_see_above | 3 | `singaporeanmalaysianrecipes:bak-chor-mee-singaporean-noodles` |
| singaporeanmalaysianrecipes | curate_duplicate | 1 | `singaporeanmalaysianrecipes:chinese-tea-eggs` |
| thematbakh | curate_junk_see_above | 1 | `thematbakh:how-to-cook-oxtail-stew-with-okra-egyptian-bamia-recipe` |
| themealdb | curate_duplicate | 95 | `themealdb:53262` |
| themealdb | curate_junk_see_above | 4 | `themealdb:53413` |
| themealdb | curate_junk_title_is_ingredient | 4 | `themealdb:53096` |
| themealdb | curate_junk_unparsed | 1 | `themealdb:53562` |
| thespicespoon | no_ingredients | 2 | `thespicespoon:pakistani-pakoras` |
| thespicespoon | curate_duplicate | 1 | `thespicespoon:risalamande-strawberry-coulis` |
| thespicespoon | curate_junk_see_above | 1 | `thespicespoon:khoresh-e-portaghal-lamb-orange-stew` |
| thespicespoon | curate_junk_title_is_ingredient | 1 | `thespicespoon:chana-dal` |
| thewoksoflife | curate_junk_unparsed | 3 | `thewoksoflife:how-to-cook-dumplings` |
| thewoksoflife | curate_duplicate | 2 | `thewoksoflife:hot-pot-how-to` |
| thewoksoflife | curate_junk_ad_or_link | 2 | `thewoksoflife:chinese-deep-fried-oysters` |
| thewoksoflife | curate_junk_see_above | 1 | `thewoksoflife:chinese-rice-cake-soup` |

Fields coerced to NULL (outside the schema lists): none.

## Tags

course: main 31900 (49.7%), dessert 10345 (16.1%), side 8656 (13.5%), snack 3946 (6.1%), sauce_condiment 3458 (5.4%), baking 2960 (4.6%), breakfast 1648 (2.6%), drink 1312 (2.0%)

cuisine_source: classifier 30848 (48.0%), source_label 22507 (35.0%), (null) 10870 (16.9%)

time_source: estimated 37086 (57.7%), source 25730 (40.1%), (null) 1230 (1.9%), source_partial 179 (0.3%)

servings_source: source 23714 (36.9%), mass 19976 (31.1%), energy 11291 (17.6%), text 9244 (14.4%)

one_pot: 0 32170, 1 31304, (null) 751

weeknight: 0 45461, 1 17534, (null) 1230

no_cook: 0 60029, 1 4196

diet: no_red_meat.ok 47896, no_red_meat.adaptable 13255, no_red_meat.no 3074, vegetarian.ok 31693, vegetarian.adaptable 27540, vegetarian.no 4992

nutrition (S14): 24,262/64,225 recipes filled (37.8%)

servings (S15): 64,225/64,225 recipes have servings (100.0%)

## Distributions (brief S10)

By source: recipenlg 35,055 (54.6%), bbcgoodfood 11,070 (17.2%), archanaskitchen 2,991 (4.7%), giallozafferano 1,736 (2.7%), thewoksoflife 1,350 (2.1%), anitalianinmykitchen 1,238 (1.9%), hebbarskitchen 1,063 (1.7%), dimitrasdishes 1,057 (1.6%), foodwishes 1,038 (1.6%), pickledplum 732 (1.1%), omnivorescookbook 719 (1.1%), themealdb 686 (1.1%), chinasichuanfood 685 (1.1%), rotinrice 684 (1.1%), recipesfromitaly 520 (0.8%), recipetinjapan 426 (0.7%), beyondkimchee 354 (0.6%), chopstickchronicles 331 (0.5%), pardonyourfrench 282 (0.4%), greedygirlgourmet 256 (0.4%), koreanbapsang 246 (0.4%), thematbakh 242 (0.4%), mygreekdish 230 (0.4%), kimchimari 228 (0.4%), pinabresciani 204 (0.3%), palestineinadish 135 (0.2%), thespicespoon 128 (0.2%), malaysianchinesekitchen 112 (0.2%), singaporeanmalaysianrecipes 111 (0.2%), cookwithipohbunny 90 (0.1%), indianhealthyrecipes 65 (0.1%), cookingwithsamira 62 (0.1%), justonecookbook 46 (0.1%), myparisiankitchen 24 (0.0%), nyonyacooking 20 (0.0%), persianpot 9 (0.0%)

By site (recipenlg split by host): bbcgoodfood 11,070 (17.2%), recipenlg:epicurious.com 9,499 (14.8%), recipenlg:foodnetwork.com 5,921 (9.2%), recipenlg:myrecipes.com 5,718 (8.9%), recipenlg:food52.com 4,883 (7.6%), archanaskitchen 2,991 (4.7%), recipenlg:cooking.nytimes.com 2,286 (3.6%), recipenlg:foodandwine.com 2,242 (3.5%), giallozafferano 1,736 (2.7%), recipenlg:seriouseats.com 1,523 (2.4%), thewoksoflife 1,350 (2.1%), anitalianinmykitchen 1,238 (1.9%), hebbarskitchen 1,063 (1.7%), dimitrasdishes 1,057 (1.6%), foodwishes 1,038 (1.6%), recipenlg:food.com 768 (1.2%), pickledplum 732 (1.1%), omnivorescookbook 719 (1.1%), themealdb 686 (1.1%), chinasichuanfood 685 (1.1%), rotinrice 684 (1.1%), recipesfromitaly 520 (0.8%), recipenlg:vegetariantimes.com 501 (0.8%), recipetinjapan 426 (0.7%), beyondkimchee 354 (0.6%), recipenlg:delish.com 347 (0.5%), recipenlg:recipes-plus.com 345 (0.5%), chopstickchronicles 331 (0.5%), pardonyourfrench 282 (0.4%), greedygirlgourmet 256 (0.4%), koreanbapsang 246 (0.4%), thematbakh 242 (0.4%), recipenlg:allrecipes.com 236 (0.4%), mygreekdish 230 (0.4%), recipenlg:cookstr.com 229 (0.4%), kimchimari 228 (0.4%), pinabresciani 204 (0.3%), palestineinadish 135 (0.2%), thespicespoon 128 (0.2%), malaysianchinesekitchen 112 (0.2%), 21 more 984 (1.5%)

By cuisine: (none) 10,870 (16.9%), italian 6,980 (10.9%), indian 5,544 (8.6%), british_irish 5,122 (8.0%), chinese 3,534 (5.5%), french 2,141 (3.3%), greek 2,011 (3.1%), japanese 1,955 (3.0%), american 1,708 (2.7%), north_african 1,551 (2.4%), caribbean 1,500 (2.3%), german_central_eu 1,500 (2.3%), indonesian_malaysian 1,500 (2.3%), korean 1,500 (2.3%), latin_american 1,500 (2.3%), mediterranean 1,500 (2.3%), mexican 1,500 (2.3%), middle_eastern 1,500 (2.3%), persian 1,500 (2.3%), southern_us 1,500 (2.3%), spanish 1,500 (2.3%), thai 1,500 (2.3%), vietnamese 1,500 (2.3%), filipino 1,499 (2.3%), turkish 1,499 (2.3%), fusion_other 290 (0.5%), east_west_african 21 (0.0%)

By cuisine source: classifier 30,848 (48.0%), source_label 22,507 (35.0%), (none) 10,870 (16.9%)

By course: main 31,900 (49.7%), dessert 10,345 (16.1%), side 8,656 (13.5%), snack 3,946 (6.1%), sauce_condiment 3,458 (5.4%), baking 2,960 (4.6%), breakfast 1,648 (2.6%), drink 1,312 (2.0%)

Diet vegetarian: ok 31,693 (49.3%), adaptable 27,540 (42.9%), no 4,992 (7.8%)

Diet no_red_meat: ok 47,896 (74.6%), adaptable 13,255 (20.6%), no 3,074 (4.8%)

Diet vegetarian_strict: adaptable 28,764 (44.8%), ok 28,590 (44.5%), no 6,871 (10.7%)

Fill, servings (any): 64,225 (100.0%)

Fill, servings from the source: 23,714 (36.9%)

Fill, servings estimated: 40,511 (63.1%)

Fill, nutrition (kcal): 24,262 (37.8%)

Fill, total time: 62,995 (98.1%)

Fill, image: 28,090 (43.7%)

Fill, video_url (R17): 1,038 (1.6%)

Fill, no steps rows (video method, R17): 725 (1.1%)

Servings source: source 23,714 (36.9%), mass 19,976 (31.1%), energy 11,291 (17.6%), text 9,244 (14.4%)

Nutrition fill by source: recipenlg 12,421/35,055 (35%), bbcgoodfood 5,800/11,070 (52%), archanaskitchen 659/2,991 (22%), giallozafferano 0/1,736 (0%), thewoksoflife 577/1,350 (43%), anitalianinmykitchen 880/1,238 (71%), hebbarskitchen 114/1,063 (11%), dimitrasdishes 413/1,057 (39%), foodwishes 410/1,038 (39%), pickledplum 262/732 (36%), omnivorescookbook 223/719 (31%), themealdb 384/686 (56%), chinasichuanfood 209/685 (31%), rotinrice 274/684 (40%), recipesfromitaly 404/520 (78%), recipetinjapan 105/426 (25%), beyondkimchee 94/354 (27%), chopstickchronicles 117/331 (35%), pardonyourfrench 159/282 (56%), greedygirlgourmet 100/256 (39%), koreanbapsang 47/246 (19%), thematbakh 130/242 (54%), mygreekdish 119/230 (52%), kimchimari 51/228 (22%), pinabresciani 54/204 (26%), palestineinadish 54/135 (40%), thespicespoon 41/128 (32%), malaysianchinesekitchen 43/112 (38%), singaporeanmalaysianrecipes 22/111 (20%), cookwithipohbunny 31/90 (34%), indianhealthyrecipes 6/65 (9%), cookingwithsamira 26/62 (42%), justonecookbook 20/46 (43%), myparisiankitchen 4/24 (17%), nyonyacooking 8/20 (40%), persianpot 1/9 (11%)

Servings fill by source: recipenlg 35,055/35,055 (100%), bbcgoodfood 11,070/11,070 (100%), archanaskitchen 2,991/2,991 (100%), giallozafferano 1,736/1,736 (100%), thewoksoflife 1,350/1,350 (100%), anitalianinmykitchen 1,238/1,238 (100%), hebbarskitchen 1,063/1,063 (100%), dimitrasdishes 1,057/1,057 (100%), foodwishes 1,038/1,038 (100%), pickledplum 732/732 (100%), omnivorescookbook 719/719 (100%), themealdb 686/686 (100%), chinasichuanfood 685/685 (100%), rotinrice 684/684 (100%), recipesfromitaly 520/520 (100%), recipetinjapan 426/426 (100%), beyondkimchee 354/354 (100%), chopstickchronicles 331/331 (100%), pardonyourfrench 282/282 (100%), greedygirlgourmet 256/256 (100%), koreanbapsang 246/246 (100%), thematbakh 242/242 (100%), mygreekdish 230/230 (100%), kimchimari 228/228 (100%), pinabresciani 204/204 (100%), palestineinadish 135/135 (100%), thespicespoon 128/128 (100%), malaysianchinesekitchen 112/112 (100%), singaporeanmalaysianrecipes 111/111 (100%), cookwithipohbunny 90/90 (100%), indianhealthyrecipes 65/65 (100%), cookingwithsamira 62/62 (100%), justonecookbook 46/46 (100%), myparisiankitchen 24/24 (100%), nyonyacooking 20/20 (100%), persianpot 9/9 (100%)

## Size

| table or index | bytes | share |
|---|---:|---:|
| steps | 79,335,424 | 34.8% |
| recipe_ingredients | 59,785,216 | 26.2% |
| recipe_diet | 25,292,800 | 11.1% |
| recipes | 20,754,432 | 9.1% |
| recipes_fts_data | 17,395,712 | 7.6% |
| recipe_slugs | 13,758,464 | 6.0% |
| sqlite_autoindex_recipes_1 | 2,453,504 | 1.1% |
| recipe_equipment_by_kind | 2,097,152 | 0.9% |
| recipe_equipment | 2,097,152 | 0.9% |
| recipes_by_cuisine | 1,622,016 | 0.7% |
| recipes_by_course | 1,486,848 | 0.7% |
| recipes_fts_docsize | 765,952 | 0.3% |
| ingredient_synonyms_by_slug | 233,472 | 0.1% |
| ingredient_synonyms | 233,472 | 0.1% |
| ingredients | 106,496 | 0.0% |
| substitutions | 98,304 | 0.0% |
| recipe_equipment_alternatives | 73,728 | 0.0% |
| substitution_components | 61,440 | 0.0% |
| substitutions_by_target | 40,960 | 0.0% |
| ingredients_by_parent | 36,864 | 0.0% |
| recipes_fts_idx | 24,576 | 0.0% |
| sqlite_schema | 20,480 | 0.0% |
| build_drops | 16,384 | 0.0% |
| units | 4,096 | 0.0% |
| sqlite_stat1 | 4,096 | 0.0% |
| season | 4,096 | 0.0% |
| recipes_fts_config | 4,096 | 0.0% |
| corpus_meta | 4,096 | 0.0% |
| build_sources | 4,096 | 0.0% |

Static tables (taxonomy, synonyms, substitutions, season, units): 823,296 bytes. Per recipe: 3,534 bytes. Linear extrapolation to 100,000 recipes: 354 MB (bar: under 300 MB on the phone).

