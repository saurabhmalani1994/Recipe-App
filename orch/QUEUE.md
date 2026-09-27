# Queue

`name | package | status | tier | brief file | target`

S1 source-fetch (datasets + schema.org scrape) | ingest | DONE (merged) | sonnet | orch/briefs/S1-source-fetch.md | v0.1
S2 app scaffold: Vite+React+TS, Capacitor, sqlite, CI APK, commit hook | app | DONE 3639216 | sonnet | orch/briefs/S2-app-scaffold.md | v0.1
S3 ingredient-line parser + canonical taxonomy | ingest | DONE (merged) | opus | orch/briefs/S3-parser-taxonomy.md | v0.1
S4 substitutions table v1 (400+ entries, schema + tests) | ingest | DONE (merged) | opus | orch/briefs/S4-substitutions.md | v0.1
S5a diet/equipment/one-pot/time taggers | ingest | RUNNING | opus | orch/briefs/S5a-diet-equipment.md |
S5b cuisine classifier + seasonality | ingest | DONE merged, BAR MISSED (68.6%/23.9%) | sonnet | orch/briefs/S5b-cuisine-season.md |
S5b-2 cuisine data expansion (2nd attempt, same tier) | ingest | RUNNING | sonnet | orch/briefs/S5b2-cuisine-data.md |
S7a settings, kitchen, favorites, my recipes + forks | app | RUNNING | sonnet | orch/briefs/S7a-user-features.md | v0.1
S6 matcher engine "what can I cook" + substitution-aware ranking | app | after S2,S3 | opus | - | v0.2
S7 planner + grocery aggregation (1.5/person) | app | after S6 | sonnet | - | v0.2
S8 curation: dedupe + quality filter + select 50-100k from raw | ingest | after S3,S5 | opus | - | v0.1
S9 corpus.db build + FTS5 + schema/corpus.sql | ingest | after S8 | opus | - | v0.1
