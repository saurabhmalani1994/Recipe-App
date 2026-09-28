Builder ingest, slice S8b (rescore by what the owner's grades track, plus D17 style and D18
freshness). The code is in e03a73b; this report is in the commit after it. Branch: my worktree
branch, cut from b737d48 (claude/funny-thompson-jcmpox HEAD). Nothing pushed. The previous
stopped run was not reused.

- Changed:
  - `score.py`: new weights. domain 0.18, lines 0.15, method 0.17, fresh 0.10, style 0.10,
    parse 0.06, qty 0.05, time 0.02, rating 0.07, pop 0.05, extras 0.05. The score is
    deterministic and stays in 0-1. The terms:
    - lines: a soft ramp. 0 at 3 lines or fewer, 0.45 at 6, full at 9-20.
    - method: a character ramp from 150 to 700. A method that is one real step under 400
      characters is halved, and header steps such as "1st Layer:" do not count as steps.
    - Three whole-score factors: a truncated method x0.7; fewer than 60% of lines parsed x0.8;
      a missing core ingredient x0.5 (kept from S8).
    - style (D17): minus 0.5 for each marker. The markers are Cool Whip, Jell-O, pudding mix,
      box mixes, cream-of soups, processed cheese, canned dough, Miracle Whip and seasoning
      packets. Marshmallows count only in savoury courses. A creamy base (sour cream, mayo or
      cream cheese) counts only outside the sweet courses.
    - Style-site priors, measured first (share of recipes with a marker):
      - kraftrecipes: 33.1%, prior 0.85 -> 0.55.
      - tasteofhome: 15.7%, prior 0.85 -> 0.70.
      - cookbooks.com: 28.9%, prior 0.30 -> 0.20.
      - For comparison: editorial sites 0.5-6.2%, all of recipenlg 17.8%.
    - fresh (D18): the share of non-staple, non-seasoning ingredients that come from the
      produce, meat or seafood aisle, full at 0.6. The share of canned, boxed or frozen lines
      is taken off with a weight of 0.8. Sweet courses run from 0.5 to 1 instead, full at 0.25.
  - `features.py`: `text_features` (style markers, creamy-base lines, shortcut lines,
    `truncated_method`). New scans write these fields.
  - `textpass.py` (new): backfills the same fields from the raw text onto the S8 scan, which
    takes 3.5 min instead of a 50-min rescan. 0 records were missing.
  - `select.py`: R11 excludes foodcom (1,214 recipes, reason `curate_excluded_source`). New
    ceiling: american plus southern_us at most 12% of the target.
  - `rank.py`: adds the tuning-set evaluation, `--compare` against an earlier run, and
    style/fresh/ceiling stats in `CURATE_REPORT.md`.
  - `eval/draw.py`: sheet name, per-band count and an exclusion list.
  - `eval/BAR.md`: a note on the tuning set versus the test sheet.
- Checks:
  - ingest pytest: 455 passed, 0 failed (ingest/curate: 62, up from 39). ruff is clean on
    every file I touched. The 13 ruff errors elsewhere in ingest were already there.
  - Determinism: a second rank run gave a byte-identical `selection.tsv` (sha256 5882065...).
  - Tuning set: the 60 graded recipes of `owner_grade.md` are now the TUNING set. The weights
    were set on them, so these numbers show fit, not a test.
    - Mean grade by tertile of the new score: top 1.30, middle 0.60, bottom 0.30. The S8
      bands were 1.05 / 0.80 / 0.35.
    - Spearman rho, score vs grade: 0.325 before, 0.491 now.
    - Of the 60, those that land in the new top 5% of the pool graded [0,2,1,0,2,2,2], a mean
      of 1.29. Those in the bottom 5% graded twelve recipes with a mean of 0.17.
  - Freshness weight is 0.10. Without it the tertiles are 1.20 / 0.70 / 0.30 (rho 0.499); with
    it they are 1.30 / 0.60 / 0.30 (rho 0.491). On its own the term tracks grade at rho 0.10,
    so it is there for D18, not for the fit.
  - Removing a term shows what drives the fit:
    - Without method: 1.15 / 0.75 / 0.30, rho 0.436.
    - Without lines: 1.25 / 0.65 / 0.30, rho 0.465.
    - Without style: 1.30 / 0.70 / 0.20, rho 0.492.
  - Fresh blind sheet: `ingest/curate/eval/owner_grade_2.md` plus its key. It has 45 recipes,
    15 per band, seed 82, and none of the 60. It was drawn after the D17 and D18 changes. Band
    scores: top 0.836-0.878, middle 0.595-0.617, bottom 0.14-0.342.
  - Selection, 80,000 (target unchanged; `/home/user/recipe-data/derived/curate/selection.tsv`):
    - 21,647 of the S8 80k stay and 58,353 change. The S8 cut sat on a tie at 0.800 (all
      top-tier sites with a flat steps term), so most of the churn replaced tied recipes.
    - The lowest score taken on score alone is 0.845.
    - Picked by: floor 34,049, editorial 3,288, score 42,663.
  - Distributions, S8 -> S8b:
    - Source: recipenlg 76,502 -> 76,712; bbcgoodfood 2,390 -> 2,389; themealdb 757 -> 759;
      foodwishes 141 -> 140; foodcom 210 -> 0.
    - Site:
      - epicurious 34,952 -> 20,717
      - myrecipes 12,504 -> 11,671
      - food.com 8,147 -> 1,448
      - food52 7,702 -> 11,760
      - foodnetwork 4,062 -> 12,605
      - nytimes 1,092 -> 4,578
      - foodandwine 988 -> 4,502
      - seriouseats 829 -> 3,347
      - tasteofhome 2,201 -> 171
      - kraftrecipes 1,157 -> 35
      - cookbooks.com 291 -> 277
    - Course:
      - main 36,000 -> 42,378 (53.0%)
      - dessert 14,863 -> 12,700
      - side 10,933 -> 10,663
      - snack 3,869 -> 4,707
      - baking 4,635 -> 3,475
      - sauce 5,691 -> 3,321
      - breakfast 1,320 -> 1,857
      - drink 2,689 -> 899
    - Cuisine: no label 27,054 -> 23,964; italian 5,314 -> 7,696; american 9,240 -> 4,235;
      southern_us 4,154 -> 2,819; british_irish 3,205 -> 4,199; french 1,570 -> 3,563;
      mexican 1,963 -> 2,659; north_african 1,500 -> 2,495; indian 1,500 -> 2,280;
      mediterranean 1,500 -> 2,190. The other floor cuisines stay at 1,500.
    - Ceiling: american plus southern_us went from 13,394 (16.7%) to 7,054 (8.8%). The new
      score did that on its own; the 12% ceiling does not bind now and stays as a guard.
    - Diet, vegetarian ok/adaptable/no: 47,367/6,077/26,556 -> 33,754/6,037/40,209. The
      vegetarian share is 49.7%; the floor is 25%.
    - Diet, no_red_meat ok/adaptable/no: 63,558/4,873/11,569 -> 57,328/5,623/17,049.
    - Style markers: 5,911 -> 191 recipes carry one.
    - Freshness term mean: 0.673 -> 0.887.
    - Median ingredient lines: 9 -> 12. Recipes with 7 lines or fewer: 27,655 -> 2,055.
    - Median method length: 546 -> 975 characters. Methods under 300 characters:
      15,520 -> 925.
    - Truncated methods in the pool: 2,201 (905 fragments, 968 header_end, 328 dangling). None
      are selected.
  - Moved up most, pool percentile (verbatim):
    - Anda/ Egg Paratha (epicurious, 88.0% -> 10.4%)
    - "Sisig" Roll (epicurious, 88.9% -> 12.2%)
    - Melting Moments (tastykitchen, 90.1% -> 13.5%)
    - Berry Vareniki (Cherry Berry Dumplings) (epicurious, 89.8% -> 13.8%)
    - The Salad Days (epicurious, 90.5% -> 14.7%)
    - Chinese Pork Dumplings (epicurious, 90.7% -> 15.1%)
    - Basic Indian Dal (epicurious, 85.5% -> 10.2%)
    - Potato Meatloaf Cups (epicurious, 86.0% -> 11.0%)
    - Roasted Veal With Chanterelles, Samperdito (epicurious, 86.0% -> 11.0%)
    - Rib-Eye, T-Bone, and Strip Steaks Cut Over 1 (cookstr, 89.5% -> 15.2%)
  - Moved down most (verbatim):
    - Easy Creamed Spinach (tasteofhome, 1.6% -> 95.9%)
    - Easy Taco Dip (kraftrecipes, 0.3% -> 94.5%)
    - Cappuccino Pudding Frosting (kraftrecipes, 1.6% -> 95.7%)
    - Cheesy Broccoli Casserole (kraftrecipes, 1.6% -> 95.4%)
    - Pudding in a Cloud (kraftrecipes, 0.4% -> 94.1%)
    - Orange Salad (food.com, 1.4% -> 94.3%)
    - Buttermilk Salad (food.com, 1.0% -> 93.6%)
    - America's Favorite Grilled Cheese Sandwich (kraftrecipes, 1.6% -> 94.0%)
    - Broccoli Rice Casserole (food.com, 1.8% -> 94.2%)
    - Strawberry Cloud (tasteofhome, 1.6% -> 93.8%)
- Outside my package:
  - `ingest/build/curate.py`: one `DROP_REASONS` entry, `curate_excluded_source`. The R11
    drop needed its own counted reason, and the e2e test checks that every reason is known.
  - Data outside git:
    - `/home/user/recipe-data/derived/curate/text/*.v4.tsv.gz` (new).
    - The S8 outputs are backed up in `/home/user/recipe-data/derived/curate/s8/`.
    - `selection.tsv`, `drops.json`, `pool.tsv.gz` and `stats.json` in `derived/curate` are
      overwritten.
    - `corpus.db` was not rebuilt; the orchestrator runs the build.
- Design was wrong about:
  - A flat freshness term. Freshness alone cut desserts from 14,863 to 3,625 and baking to
    1,249, because 62% of desserts have no fresh item. I added the sweet-course baseline
    described under Changed.
  - The american/southern ceiling is not what moves the mix. The style and substance terms cut
    those two cuisines from 16.7% to 8.8% before the ceiling is reached.
  - "Convenience products have no effect" (superseded by D17 in any case). On the tuning set
    the style term tracks grade at rho 0.14, so it is a weak signal there too.
  - Truncation false positives turned up in a hand check, and I fixed them before the final
    run:
    - epicurious's trailing "DO AHEAD:" header.
    - Photo credits ending "by Sang An".
    - "CRUST:/FILLING:" section headers.
    - "Pudding:" as an ingredient header.
  - Scraped ad lines ("Click to see savings", "a1 cupwater") get past the S8 junk filters. The
    under-60%-parsed factor now keeps them out of the top.
  - The vegetarian share fell from 66.8% to 49.7%, because fresh meat and fish count as fresh
    and mains rose. It is still double the 25% floor.
- Open:
  - The owner grades `ingest/curate/eval/owner_grade_2.md` (45 recipes, about 8 min). Then run
    `python3 -m ingest.curate.eval.draw --score ingest/curate/eval/owner_grade_2.md`. The next
    move is the owner's.
  - My recommendation: cap how far below the score cut a cuisine floor may reach. The 5
    lowest recipes kept (0.146-0.253) all come in through the fusion_other floor, which takes
    all 430 recipes available. Four of them are Cool Whip salads: Pink Lady Salad, Hawaiian
    Salad, Hawaiian Surprise and Hawaiian Pineapple Salad. The fifth is Tropical Fruit Salad.
