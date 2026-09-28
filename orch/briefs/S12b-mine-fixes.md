# Brief S12b: My Recipes in Cook, follow-ups (app)
From the orchestrator. Read orch/reports/S12.md "Open". Owner, verbatim: "Upload my own recipes based on
something i did that worked well".
Base: claude/funny-thompson-jcmpox HEAD. Scope: `app/` only. S15 may touch
CorpusRecipeDetail.tsx; do not edit it.
Model: mid. Effort: medium.

Deliverable:
1 Bug from the S11+S12 merge (routes/Cook.tsx, around line 341): the favorite star on a "Mine"
  result calls toggleFavorite(result.key) with source 'corpus'. Fix it so a Mine result
  favorites as source 'my' and shows its correct starred state. Add a test.
2 Ranking (ruling R12): the owner's own recipes worked well by definition, so a My Recipe ranks
  as the top quality (1.0) within its coverage band, not 0.
3 Filters (ruling R13):
  - Add optional fields to the My Recipe editor: total minutes, one-pot (yes/no), and equipment
    (the same list as Settings).
  - Also infer them from the steps where the user left them empty. Port the smallest useful
    part of ingest/tag/equipment.py and timing.py: keyword equipment and summed "N minutes".
    Show them as suggestions the user can accept.
  - When a filter is active and a My Recipe has no value for it, exclude it and count it in a
    small "2 of your recipes hidden: no time set" note. Never pass it through unfiltered
    (rule 11).
Checks: scripts/check.sh, and e2e with PW_PORT=4316. Report per §6.
