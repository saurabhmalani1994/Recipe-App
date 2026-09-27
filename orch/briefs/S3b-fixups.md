# Brief S3b: taxonomy, subs and parser fixes found by S5a
From the orchestrator. Read orch/reports/S5a.md section "Outside my package" only.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/taxonomy/`, `ingest/subs/`, `ingest/parse/`,
and `ingest/tag/diet.py` only to remove PROXY_TARGET once subs has a stock target.
Model: mid. Effort: medium.

Deliverable:
1 taxonomy: frog_legs no longer inherits red_meat. Audit every child of `meat` for the same
  mistake (poultry, game birds, rabbit, frog, alligator...) and list the changes.
2 subs: add targets for generic `stock`, `chicken`, `cooked_chicken`, `cream_of_chicken_soup`, and
  the next 10 most frequent vegetarian blockers without a quality >= 2 vegetarian-safe swap.
  Rank the blockers with ingest/tag/run_corpus output at /home/user/recipe-data/derived/tags_sample.jsonl.
  Delete diet.PROXY_TARGET, and keep its test passing through the real target.
3 parser: "crab brown and white meat" should resolve to crab. "1 clove 1 clove" is a
  duplicated-quantity artifact. "1 roast" should resolve to a generic roast (beef as parent,
  red_meat). Add each as a gold line.
Checks: all ingest pytest, the taxonomy validator at 0 errors, the subs validator at 0 errors,
the parse gold and tag gold bars still PASSED. Report per §6.
