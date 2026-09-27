# Codex adversarial review brief: substitutions table v1

Paste this into Codex CLI from the repo root. Read `ingest/subs/substitutions.yaml`,
`ingest/subs/ingredients.yaml` and `ingest/subs/COVERAGE.md` only.

The owner cooks "ALL KINDS of food". Find, ranked by severity, at most 25 items:
1. Diet flag errors: an ingredient whose flags miss a hidden animal product (e.g. anchovy,
   gelatin, lard, fish in curry pastes, shrimp paste, chicken bouillon). Presets: Vegetarian
   (no meat, fish, shellfish or animal-derived; dairy, egg and honey OK) and No red meat (fish
   and poultry OK).
2. Wrong or dangerous ratios: salt/baking soda/leavener swaps, anything unsafe for canning.
3. Substitutes that a practised cook would call wrong for the stated context.
4. Important missing targets for Indian, Chinese, Japanese, Korean, Thai, Vietnamese, Mexican,
   Middle Eastern, Italian, French or American cooking.
For each item, give the entry id, the problem in one sentence, and the fix. Write the output to
`reviews/02-subs-codex-findings.md`.
