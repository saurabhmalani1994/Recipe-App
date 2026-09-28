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
