# Brief S10b: cuisine and course label fixes before the final rebuild (ingest)
From the orchestrator. Seen in the S10 random sample (orch/reports/S10.md), verbatim: "Vietnamese Summer Rolls" (tagged
course baking), "Super Bowl: General Tso'S Chicken Wings" (classified korean). The course tagger's
blind accuracy was 82% (bar 85%), queue item S9b.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/cuisine/`, `ingest/build/course.py` and its gold.
Model: mid. Effort: high.

Deliverable:
1 Cuisine: a cuisine demonym or dish marker in the title overrides the classifier. Use the
  lexicon from S5b-2 plus demonyms ("Vietnamese", "Thai", "Moroccan"...), and the owner's term
  "General Tso's" as chinese (Chinese-American counts as chinese). Precedence: site label >
  title marker > classifier. Measure it on the S10 corpus: how many labels change, with 20
  changes verbatim.
2 Course (S9b): add modifier rules ("summer rolls", "spring rolls", "dumplings" → main or snack,
  never baking; "breakfast X" → breakfast; jello or pudding "salads" → dessert; "wings" → snack
  or main). Label a FRESH 60-recipe blind set drawn from the S10 corpus after the rules are
  frozen. Bar: >= 85% on it.
3 Emit a small fix list the build applies (a per-key override TSV), so a full rebuild isn't
  needed to test. The orchestrator runs the final rebuild after the crawls finish.
Checks: pytest, the course blind score, and the cuisine change counts. Report per §6.
