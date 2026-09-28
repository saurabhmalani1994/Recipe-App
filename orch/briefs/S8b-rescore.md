# Brief S8b: rescore by what the owner's grades actually track (ingest)
From the orchestrator. The owner graded the 60-recipe blind sheet (grades are now in
ingest/curate/eval/owner_grade.md, and the key is in owner_grade_key.json). Verdict, from
`python3 -m ingest.curate.eval.draw --score`: FAIL. Band means were top 1.05, middle 0.80, bottom
0.35. Ordering and separation passed, but top >= 1.5 failed. Top band counts: 0 x7, 1 x5, 2 x8.
Established by the orchestrator on those 60 grades (mean grade by group):
- ingredient lines <= 7: 0.16 (n 25); 8-12: 1.12 (n 17); >= 13: 1.17 (n 18)
- method < 300 chars: 0.28 (n 18); method >= 600 chars: 1.24 (n 29)
- convenience/brand products (cake mix, Cool Whip, Jell-O, cream-of soup...): 0.82 vs 0.71 without,
  so no effect. Do NOT penalise these.
The current score weights lines at only 0.05. Substance (enough ingredients, a real method) is
what the owner rewards.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/curate/`.
Model: strong. Effort: high.

Deliverable:
1 Add substance signals to score.py: ingredient-line count (a soft ramp that is low at <= 6 and
  full at about 9-20), method length and step count (penalise one-liners and "(1) 1st Layer:"
  fragments), and a truncated-method detector. Reweight so that substance dominates alongside
  domain. Keep it documented, deterministic, and 0-1.
2 The 60 graded recipes are now the TUNING set; say so, and report the new band means on them.
  Then draw a FRESH blind sheet of 45 recipes (15 per band, a new seed, excluding the 60) with
  draw.py, into ingest/curate/eval/owner_grade_2.md plus its key. The same BAR.md applies, and
  the owner grades it once more (the orchestrator sends it).
3 Re-run rank and select into a new selection (the target stays 80k). Report how many of the
  current 80k change, and the new distributions (source, site, course, cuisine, diet). Apply
  R11 (exclude the foodcom source) in select. Do not run the full corpus build; the
  orchestrator runs it after the BBC retry lands.
Checks: pytest counts and the tuning-set band means. Report per §6, with 10 recipes that moved
up the most and 10 that moved down, verbatim.

## Amendment (owner, verbatim, D17, supersedes the "Do NOT penalise these" line above)
"many of the apps felt very southern or mid western, using things like cool whip or sour cream for
lots of the recipes, which is not my style."
- Add a style signal: down-weight convenience and heartland markers (Cool Whip or whipped topping,
  Jell-O, pudding mix, cake or brownie mix, cream-of-X soup, Velveeta or processed cheese,
  crescent rolls or canned biscuits, Miracle Whip, onion soup mix, heavy use of sour cream,
  mayonnaise or cream cheese as the base, marshmallows in savoury dishes). Also down-weight sites
  that are mostly that style (kraftrecipes, cookbooks.com, and Taste of Home to a lesser degree;
  measure the rate first).
- Rebalance so the 80k leans global. The per-cuisine floors stay, but american and southern_us
  get a CEILING (propose one, e.g. at most 15% combined, and report the before and after).
- Draw the fresh 45-recipe sheet AFTER these changes, so the owner grades the new mix.
