# corpus.db, the S19 final rebuild

Built by slice S19 after every crawl finished (scan --refresh-grown -> rank -> build). The
generated build report follows the summary. The S10 build this replaces is kept at
`/home/user/recipe-data/derived/corpus_s10_out.db`, and the S10 curation outputs at
`/home/user/recipe-data/derived/curate/s10/`.

## Summary

- File: `/home/user/recipe-data/out/corpus.db`, 227,942,400 bytes (227.9 MB, cap 235 MB),
  **68,966 recipes**, schema_version 4. LFS oid
  `891349ec74a43ddf75a1ea619309c016fdf97398419b768ff89366cb41265c94`; the same file is committed
  at `corpus/corpus.db` through git LFS.
- Schema 4 saves 13,877,248 bytes (13.9 MB), measured on a copy of the S10 build: the unused
  vegetarian_strict rows of recipe_diet 11,177,984 bytes, the short swaps keys 2,699,264 more.
  `select.EST_BASE` drops by the 216 bytes a recipe this saves, so the size cap now admits
  68,968 recipes (estimate 227.2 MB) where S10 admitted 64,227. The build wrote 68,966: R16
  dropped 2 more recipenlg recipes at build time, as in S10.
- R20 is in `derive()`: source label > title demonym > the classifier above its threshold >
  title dish marker > none. 3,828 recipes (5.6%) carry `cuisine_source = 'title_marker'`. The
  rank applies the same rule (`cuisines.retitle`) to the 2.2M scan records made before R20, so
  the cuisine floors count what the build writes: 57,060 scan records changed cuisine that way.
- Every scanned line is accounted for: 2,477,710 = 68,966 written + 2,408,744 dropped with a
  reason. Against the S10 selection: 56,630 kept, 12,338 entered, 7,597 left.
- Crawls finished since S10: bbcgoodfood 17,404 lines (S10 scanned 11,249), archanaskitchen
  5,000 (3,403), giallozafferano 5,000 (1,749), justonecookbook 1,004 (50), dimitrasdishes 1,086
  (1,068). `scan --refresh-grown` rescanned those five; every other source was unchanged.
  Every source was built at the line count the scan pinned.
- Build fix: an outermost SAVEPOINT commits on RELEASE, so each recipe had been committed ahead
  of its batch checkpoint. The first S19 build was killed mid-batch (a pass run past its
  timeout); its resume counted 321 themealdb recipes a second time as `duplicate_id`. The batch
  now opens its transaction first, a test kills a build before its first checkpoint and checks
  that nothing was committed, and this build was run fresh after the fix.

To rebuild, run each step foreground, under `timeout`, and repeat a step until it reports
complete:

    python3 -m ingest.curate.scan --refresh-grown --budget 540
    python3 -m ingest.curate.rank --compare /home/user/recipe-data/derived/curate/s10
    python3 -m ingest.build.build_corpus --select /home/user/recipe-data/derived/curate/selection.tsv \
        --out /home/user/recipe-data/out/corpus.next.db --fresh --stop-after 30000   # then without --fresh,
                                                                                     # --stop-after 25000
    # then move corpus.next.db over corpus.db, regenerate this report (build_corpus.report), and
    # copy the file to corpus/corpus.db (git LFS)

## 20 random recipes, verbatim (random.Random(19) over all recipe ids)

Title, then (source, cuisine, cuisine_source, course).

- "Homemade Rice Puttu Recipe | Kerala Matta Rice or Basmati Rice" (archanaskitchen, indian, source_label, side) `archanaskitchen:recipe_kerala-matta-rice-puttu-recipe`
- "Red velvet brownies" (bbcgoodfood, no cuisine, -, dessert) `bbcgoodfood:red-velvet-brownies`
- "Sesame salmon subs with cucumber pickle" (bbcgoodfood, british_irish, source_label, main) `bbcgoodfood:sesame-salmon-subs-cucumber-pickle`
- "Frosted white chocolate Easter cake" (bbcgoodfood, british_irish, source_label, dessert) `bbcgoodfood:frosted-white-chocolate-easter-cake`
- "Sizzled chipotle steak sarnies" (bbcgoodfood, mexican, source_label, main) `bbcgoodfood:sizzled-chipotle-steak-sarnies`
- "Beef & red pepper burgers" (bbcgoodfood, no cuisine, -, main) `bbcgoodfood:beef-red-pepper-burgers`
- "Million Dollar Dip – Worth Every Penny" (foodwishes, no cuisine, -, snack) `foodwishes:2019/06/million-dollar-dip-worth-every-penny`
- "Coffee shortcrust pastry" (giallozafferano, italian, source_label, baking) `giallozafferano:recipes_coffee-shortcrust-pastry.html`
- "Lemony Greek Rice Pilaf (Pilafi) Recipe with Chicken legs" (mygreekdish, greek, source_label, side) `mygreekdish:recipe_lemony-greek-rice-pilaf-with-chicken-thighs`
- "Giouvetsi recipe (Greek Beef stew with Orzo pasta)" (mygreekdish, greek, source_label, main) `mygreekdish:recipe_giouvetsi-beef-stew-with-orzo-pasta`
- "Taboon Bread Recipe" (palestineinadish, middle_eastern, source_label, baking) `palestineinadish:recipes_taboon-bread-recipe`
- "Roasted Veal Chop With Morels" (recipenlg, french, classifier, main) `recipenlg:1273385`
- "Tacos With Pork In Green Sauce (" (recipenlg, mexican, classifier, main) `recipenlg:1328159`
- "Lemon Poppy Seed Muffins" (recipenlg, no cuisine, -, baking) `recipenlg:1364189`
- "Ethiopian-Ish Sweet Potato-Squash Soup" (recipenlg, east_west_african, title_marker, main) `recipenlg:1367315`
- "Radish Green And Pistachio Pesto" (recipenlg, no cuisine, -, sauce_condiment) `recipenlg:1399188`
- "Tacos Árabes (Pita-Wrapped, Cumin-Marinated-Pork Tacos) Recipe" (recipenlg, filipino, classifier, main) `recipenlg:1480615`
- "Lemon Pound Cake with Lemon Curd" (recipenlg, british_irish, classifier, dessert) `recipenlg:1708410`
- "Cottage Cheese And Feta Stuffed Peppers" (themealdb, greek, classifier, main) `themealdb:53490`
- "Fa Gao (Chinese Prosperity Cake)" (thewoksoflife, chinese, source_label, dessert) `thewoksoflife:fa-gao-chinese-prosperity-cake`

Wrong or doubtful: "Tacos Árabes" is filipino (the classifier is confident, so R20 lets it stand
over the "taco" dish marker); "Cottage Cheese And Feta Stuffed Peppers" greek is a guess.
Course is right on all 20.

10 title_marker recipes (random.Random(20)): "Miguel's Ceviche" latin_american, "Beef and Noodle
Soup "a la Vietnamese"" vietnamese, "Vegetarian Pad Thai" thai, "Pad Thai" thai, "Feijoada
Fritters With Collard Greens" latin_american, "Turkish Chicken and Okra Casserole" turkish,
"FuFu Berry Pulled Beef" east_west_african (wrong: a brand name), "Turkish Okra Casserole"
turkish, "Lahmacun [ Turkish Spiced Lamb Flatbread]" turkish, "Warm Yam Scones" british_irish
(doubtful).

## Build report (generated by `build_corpus.report`)

File: `/home/user/recipe-data/out/corpus.db`, 227,942,400 bytes (227.9 MB), 68,966 recipes, schema_version 4.

| source | lines in file | quota | selected | written | dropped |
|---|---:|---:|---:|---:|---:|
| anitalianinmykitchen | 1,246 | 1238 | 1,238 | 1,238 | 0 |
| archanaskitchen | 5,000 | 4159 | 4,159 | 4,159 | 0 |
| bbcgoodfood | 17,404 | 17147 | 17,147 | 17,147 | 0 |
| beyondkimchee | 358 | 354 | 354 | 354 | 0 |
| chinasichuanfood | 692 | 685 | 685 | 685 | 0 |
| chopstickchronicles | 333 | 331 | 331 | 331 | 0 |
| cookingwithsamira | 62 | 62 | 62 | 62 | 0 |
| cookwithipohbunny | 113 | 90 | 90 | 90 | 0 |
| dimitrasdishes | 1,086 | 1075 | 1,075 | 1,075 | 0 |
| foodwishes | 1,084 | 1038 | 1,038 | 1,038 | 0 |
| giallozafferano | 5,000 | 4954 | 4,954 | 4,954 | 0 |
| greedygirlgourmet | 280 | 255 | 255 | 255 | 0 |
| hebbarskitchen | 1,087 | 1063 | 1,063 | 1,063 | 0 |
| indianhealthyrecipes | 65 | 65 | 65 | 65 | 0 |
| justonecookbook | 1,004 | 969 | 969 | 969 | 0 |
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
| pickledplum | 744 | 731 | 731 | 731 | 0 |
| pinabresciani | 208 | 204 | 204 | 204 | 0 |
| recipenlg | 2,231,142 | 28438 | 28,438 | 28,436 | 2 |
| recipesfromitaly | 521 | 520 | 520 | 520 | 0 |
| recipetinjapan | 428 | 426 | 426 | 426 | 0 |
| rotinrice | 689 | 684 | 684 | 684 | 0 |
| singaporeanmalaysianrecipes | 145 | 111 | 111 | 111 | 0 |
| thematbakh | 243 | 242 | 242 | 242 | 0 |
| themealdb | 790 | 644 | 644 | 644 | 0 |
| thespicespoon | 133 | 128 | 128 | 128 | 0 |
| thewoksoflife | 1,358 | 1350 | 1,350 | 1,350 | 0 |

## Drops, with reasons

| source | reason | count | first example |
|---|---|---:|---|
| anitalianinmykitchen | curate_duplicate | 6 | `anitalianinmykitchen:chocolate-crinkle-cookies` |
| anitalianinmykitchen | curate_junk_see_above | 2 | `anitalianinmykitchen:pandoro` |
| archanaskitchen | curate_junk_unparsed | 816 | `archanaskitchen:recipe_moong-dal-idli-dosa-batter-recipe-in-hindi` |
| archanaskitchen | curate_junk_ad_or_link | 14 | `archanaskitchen:recipe_nutella-filled-hand-pies-recipe` |
| archanaskitchen | curate_junk_see_above | 5 | `archanaskitchen:recipe_no-bake-steamed-bread-pudding` |
| archanaskitchen | no_ingredients | 4 | `archanaskitchen:recipe_how-to-make-homemade-tomato-puree` |
| archanaskitchen | curate_duplicate | 1 | `archanaskitchen:recipe_video-recipe-how-to-make-homemade-paneer` |
| archanaskitchen | curate_junk_bad_title | 1 | `archanaskitchen:recipe_berry-focaccia-with-mascarpone-cheese-recipe-italian-bread-topped-with-mixed-berries-and-served-with-sweetened-mascarpone-cheese` |
| bbcgoodfood | curate_junk_see_above | 125 | `bbcgoodfood:how-to-make-polenta` |
| bbcgoodfood | curate_duplicate | 92 | `bbcgoodfood:panettone-2` |
| bbcgoodfood | curate_junk_title_is_ingredient | 18 | `bbcgoodfood:labneh` |
| bbcgoodfood | curate_junk_ad_or_link | 9 | `bbcgoodfood:sticky-ginger-skillet-parkin` |
| bbcgoodfood | curate_junk_unparsed | 9 | `bbcgoodfood:cheesy-black-bean-quesadillas` |
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
| giallozafferano | curate_junk_title_is_ingredient | 14 | `giallozafferano:recipes_veal-cutlets.html` |
| giallozafferano | curate_junk_see_above | 10 | `giallozafferano:recipes_canape.html` |
| giallozafferano | curate_junk_ad_or_link | 9 | `giallozafferano:recipes_how-to-clean-cabbage-and-cauliflower.html` |
| giallozafferano | curate_duplicate | 5 | `giallozafferano:recipes_teriyaki-sauce.html` |
| giallozafferano | curate_junk_unparsed | 4 | `giallozafferano:recipes_how-to-clean-the-scorpionfish.html` |
| giallozafferano | no_ingredients | 4 | `giallozafferano:recipes_how-to-cook-en-papillote.html` |
| github_openrecipe | curate_duplicate | 1 | `github_openrecipe:1` |
| github_openrecipe | curate_junk_ad_or_link | 1 | `github_openrecipe:0` |
| github_recipegen | curate_below_cut | 3 | `github_recipegen:清蒸鱼_顶级配方.md` |
| github_recipegen | no_steps | 2 | `github_recipegen:白切鸡_顶级配方_Modern.md` |
| greedygirlgourmet | curate_junk_see_above | 21 | `greedygirlgourmet:a-spicy-bihun-goreng-or-fried-thin-rice-vermicelli-recipe` |
| greedygirlgourmet | curate_duplicate | 2 | `greedygirlgourmet:strawberry-matcha-latte` |
| greedygirlgourmet | curate_junk_ad_or_link | 1 | `greedygirlgourmet:easy-shrimp-poke-bowl` |
| greedygirlgourmet | no_steps | 1 | `greedygirlgourmet:korean-dipping-sauce-for-dumplings` |
| hebbarskitchen | curate_junk_unparsed | 22 | `hebbarskitchen:ghevar-recipe-crispy-porous-ghewar-home` |
| hebbarskitchen | curate_duplicate | 1 | `hebbarskitchen:idli-recipe-soft-idli-idli-rava` |
| hebbarskitchen | curate_junk_ad_or_link | 1 | `hebbarskitchen:how-to-make-idli-without-idli-stand` |
| hf_cuisine_type | no_steps | 34,348 | `hf_cuisine_type:4` |
| justonecookbook | curate_junk_ad_or_link | 18 | `justonecookbook:matsutake-gohan` |
| justonecookbook | curate_junk_see_above | 12 | `justonecookbook:shoyu-ramen` |
| justonecookbook | curate_duplicate | 3 | `justonecookbook:unagi-sauce` |
| justonecookbook | curate_junk_title_is_ingredient | 1 | `justonecookbook:simple-syrup` |
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
| pickledplum | curate_duplicate | 3 | `pickledplum:cocktail-sauce-recipe` |
| pickledplum | curate_junk_see_above | 2 | `pickledplum:dry-fried-green-beans-recipe` |
| pinabresciani | curate_junk_see_above | 2 | `pinabresciani:vegetarian-pasta-e-piselli` |
| pinabresciani | curate_duplicate | 1 | `pinabresciani:arugula-pesto` |
| pinabresciani | curate_junk_ad_or_link | 1 | `pinabresciani:almond-cake` |
| recipenlg | curate_below_cut | 1,827,393 | `recipenlg:0` |
| recipenlg | curate_duplicate | 351,585 | `recipenlg:2` |
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
| themealdb | curate_duplicate | 137 | `themealdb:53262` |
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

course: main 34691 (50.3%), dessert 11100 (16.1%), side 8977 (13.0%), snack 4117 (6.0%), sauce_condiment 3719 (5.4%), baking 2912 (4.2%), breakfast 1888 (2.7%), drink 1562 (2.3%)

cuisine_source: source_label 30786 (44.6%), classifier 25768 (37.4%), (null) 8584 (12.4%), title_marker 3828 (5.6%)

time_source: source 37102 (53.8%), estimated 30460 (44.2%), (null) 1223 (1.8%), source_partial 181 (0.3%)

servings_source: source 34961 (50.7%), mass 16533 (24.0%), energy 9346 (13.6%), text 8126 (11.8%)

one_pot: 0 33931, 1 34283, (null) 752

weeknight: 0 47466, 1 20277, (null) 1223

no_cook: 0 63960, 1 5006

diet: no_red_meat.ok 51980, no_red_meat.adaptable 13763, no_red_meat.no 3223, vegetarian.ok 35723, vegetarian.adaptable 28145, vegetarian.no 5098

nutrition (S14): 25,118/68,966 recipes filled (36.4%)

servings (S15): 68,966/68,966 recipes have servings (100.0%)

## Distributions (brief S10)

By source: recipenlg 28,436 (41.2%), bbcgoodfood 17,147 (24.9%), giallozafferano 4,954 (7.2%), archanaskitchen 4,159 (6.0%), thewoksoflife 1,350 (2.0%), anitalianinmykitchen 1,238 (1.8%), dimitrasdishes 1,075 (1.6%), hebbarskitchen 1,063 (1.5%), foodwishes 1,038 (1.5%), justonecookbook 969 (1.4%), pickledplum 731 (1.1%), omnivorescookbook 719 (1.0%), chinasichuanfood 685 (1.0%), rotinrice 684 (1.0%), themealdb 644 (0.9%), recipesfromitaly 520 (0.8%), recipetinjapan 426 (0.6%), beyondkimchee 354 (0.5%), chopstickchronicles 331 (0.5%), pardonyourfrench 282 (0.4%), greedygirlgourmet 255 (0.4%), koreanbapsang 246 (0.4%), thematbakh 242 (0.4%), mygreekdish 230 (0.3%), kimchimari 228 (0.3%), pinabresciani 204 (0.3%), palestineinadish 135 (0.2%), thespicespoon 128 (0.2%), malaysianchinesekitchen 112 (0.2%), singaporeanmalaysianrecipes 111 (0.2%), cookwithipohbunny 90 (0.1%), indianhealthyrecipes 65 (0.1%), cookingwithsamira 62 (0.1%), myparisiankitchen 24 (0.0%), nyonyacooking 20 (0.0%), persianpot 9 (0.0%)

By site (recipenlg split by host): bbcgoodfood 17,147 (24.9%), recipenlg:epicurious.com 7,668 (11.1%), giallozafferano 4,954 (7.2%), recipenlg:myrecipes.com 4,714 (6.8%), recipenlg:foodnetwork.com 4,632 (6.7%), archanaskitchen 4,159 (6.0%), recipenlg:food52.com 3,920 (5.7%), recipenlg:cooking.nytimes.com 1,759 (2.6%), recipenlg:foodandwine.com 1,718 (2.5%), thewoksoflife 1,350 (2.0%), anitalianinmykitchen 1,238 (1.8%), recipenlg:seriouseats.com 1,206 (1.7%), dimitrasdishes 1,075 (1.6%), hebbarskitchen 1,063 (1.5%), foodwishes 1,038 (1.5%), justonecookbook 969 (1.4%), recipenlg:food.com 905 (1.3%), pickledplum 731 (1.1%), omnivorescookbook 719 (1.0%), chinasichuanfood 685 (1.0%), rotinrice 684 (1.0%), themealdb 644 (0.9%), recipesfromitaly 520 (0.8%), recipetinjapan 426 (0.6%), recipenlg:vegetariantimes.com 412 (0.6%), beyondkimchee 354 (0.5%), chopstickchronicles 331 (0.5%), pardonyourfrench 282 (0.4%), recipenlg:recipes-plus.com 282 (0.4%), recipenlg:delish.com 261 (0.4%), greedygirlgourmet 255 (0.4%), recipenlg:allrecipes.com 250 (0.4%), koreanbapsang 246 (0.4%), thematbakh 242 (0.4%), mygreekdish 230 (0.3%), kimchimari 228 (0.3%), pinabresciani 204 (0.3%), recipenlg:cookstr.com 194 (0.3%), palestineinadish 135 (0.2%), thespicespoon 128 (0.2%), 22 more 1,008 (1.5%)

By cuisine: italian 10,060 (14.6%), (none) 8,584 (12.4%), indian 6,855 (9.9%), british_irish 6,638 (9.6%), chinese 3,579 (5.2%), japanese 2,912 (4.2%), french 2,135 (3.1%), greek 1,937 (2.8%), american 1,590 (2.3%), north_african 1,519 (2.2%), persian 1,501 (2.2%), thai 1,501 (2.2%), caribbean 1,500 (2.2%), german_central_eu 1,500 (2.2%), indonesian_malaysian 1,500 (2.2%), korean 1,500 (2.2%), latin_american 1,500 (2.2%), mediterranean 1,500 (2.2%), mexican 1,500 (2.2%), middle_eastern 1,500 (2.2%), southern_us 1,500 (2.2%), filipino 1,499 (2.2%), spanish 1,499 (2.2%), vietnamese 1,499 (2.2%), turkish 1,498 (2.2%), east_west_african 355 (0.5%), fusion_other 305 (0.4%)

By cuisine source: source_label 30,786 (44.6%), classifier 25,768 (37.4%), (none) 8,584 (12.4%), title_marker 3,828 (5.6%)

By course: main 34,691 (50.3%), dessert 11,100 (16.1%), side 8,977 (13.0%), snack 4,117 (6.0%), sauce_condiment 3,719 (5.4%), baking 2,912 (4.2%), breakfast 1,888 (2.7%), drink 1,562 (2.3%)

Diet vegetarian: ok 35,723 (51.8%), adaptable 28,145 (40.8%), no 5,098 (7.4%)

Diet no_red_meat: ok 51,980 (75.4%), adaptable 13,763 (20.0%), no 3,223 (4.7%)

Fill, servings (any): 68,966 (100.0%)

Fill, servings from the source: 34,961 (50.7%)

Fill, servings estimated: 34,005 (49.3%)

Fill, nutrition (kcal): 25,118 (36.4%)

Fill, total time: 67,743 (98.2%)

Fill, image: 39,450 (57.2%)

Fill, video_url (R17): 1,038 (1.5%)

Fill, no steps rows (video method, R17): 725 (1.1%)

Servings source: source 34,961 (50.7%), mass 16,533 (24.0%), energy 9,346 (13.6%), text 8,126 (11.8%)

Nutrition fill by source: recipenlg 10,016/28,436 (35%), bbcgoodfood 8,741/17,147 (51%), giallozafferano 0/4,954 (0%), archanaskitchen 732/4,159 (18%), thewoksoflife 577/1,350 (43%), anitalianinmykitchen 880/1,238 (71%), dimitrasdishes 417/1,075 (39%), hebbarskitchen 114/1,063 (11%), foodwishes 410/1,038 (39%), justonecookbook 284/969 (29%), pickledplum 262/731 (36%), omnivorescookbook 223/719 (31%), chinasichuanfood 209/685 (31%), rotinrice 274/684 (40%), themealdb 363/644 (56%), recipesfromitaly 404/520 (78%), recipetinjapan 105/426 (25%), beyondkimchee 94/354 (27%), chopstickchronicles 117/331 (35%), pardonyourfrench 159/282 (56%), greedygirlgourmet 100/255 (39%), koreanbapsang 47/246 (19%), thematbakh 130/242 (54%), mygreekdish 119/230 (52%), kimchimari 51/228 (22%), pinabresciani 54/204 (26%), palestineinadish 54/135 (40%), thespicespoon 41/128 (32%), malaysianchinesekitchen 43/112 (38%), singaporeanmalaysianrecipes 22/111 (20%), cookwithipohbunny 31/90 (34%), indianhealthyrecipes 6/65 (9%), cookingwithsamira 26/62 (42%), myparisiankitchen 4/24 (17%), nyonyacooking 8/20 (40%), persianpot 1/9 (11%)

Servings fill by source: recipenlg 28,436/28,436 (100%), bbcgoodfood 17,147/17,147 (100%), giallozafferano 4,954/4,954 (100%), archanaskitchen 4,159/4,159 (100%), thewoksoflife 1,350/1,350 (100%), anitalianinmykitchen 1,238/1,238 (100%), dimitrasdishes 1,075/1,075 (100%), hebbarskitchen 1,063/1,063 (100%), foodwishes 1,038/1,038 (100%), justonecookbook 969/969 (100%), pickledplum 731/731 (100%), omnivorescookbook 719/719 (100%), chinasichuanfood 685/685 (100%), rotinrice 684/684 (100%), themealdb 644/644 (100%), recipesfromitaly 520/520 (100%), recipetinjapan 426/426 (100%), beyondkimchee 354/354 (100%), chopstickchronicles 331/331 (100%), pardonyourfrench 282/282 (100%), greedygirlgourmet 255/255 (100%), koreanbapsang 246/246 (100%), thematbakh 242/242 (100%), mygreekdish 230/230 (100%), kimchimari 228/228 (100%), pinabresciani 204/204 (100%), palestineinadish 135/135 (100%), thespicespoon 128/128 (100%), malaysianchinesekitchen 112/112 (100%), singaporeanmalaysianrecipes 111/111 (100%), cookwithipohbunny 90/90 (100%), indianhealthyrecipes 65/65 (100%), cookingwithsamira 62/62 (100%), myparisiankitchen 24/24 (100%), nyonyacooking 20/20 (100%), persianpot 9/9 (100%)

## Size

| table or index | bytes | share |
|---|---:|---:|
| steps | 86,470,656 | 37.9% |
| recipe_ingredients | 61,026,304 | 26.8% |
| recipes | 23,707,648 | 10.4% |
| recipes_fts_data | 18,046,976 | 7.9% |
| recipe_slugs | 14,364,672 | 6.3% |
| recipe_diet | 11,800,576 | 5.2% |
| sqlite_autoindex_recipes_1 | 2,920,448 | 1.3% |
| recipe_equipment_by_kind | 2,224,128 | 1.0% |
| recipe_equipment | 2,224,128 | 1.0% |
| recipes_by_cuisine | 1,769,472 | 0.8% |
| recipes_by_course | 1,597,440 | 0.7% |
| recipes_fts_docsize | 823,296 | 0.4% |
| ingredient_synonyms_by_slug | 233,472 | 0.1% |
| ingredient_synonyms | 233,472 | 0.1% |
| ingredients | 106,496 | 0.0% |
| substitutions | 98,304 | 0.0% |
| recipe_equipment_alternatives | 69,632 | 0.0% |
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

Static tables (taxonomy, synonyms, substitutions, season, units): 823,296 bytes. Per recipe: 3,293 bytes. Linear extrapolation to 100,000 recipes: 330 MB (bar: under 300 MB on the phone).

