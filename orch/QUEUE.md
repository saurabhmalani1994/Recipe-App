# Queue

`name | package | status | tier | brief file | target`

S1 source-fetch (datasets + schema.org scrape) | ingest | RUNNING | sonnet | orch/briefs/S1-source-fetch.md | v0.1
S2 app scaffold: Vite+React+TS, Capacitor, sqlite, CI APK, commit hook | app | RUNNING | sonnet | orch/briefs/S2-app-scaffold.md | v0.1
S3 ingredient-line parser + canonical taxonomy seed | ingest | after S1 (needs sample lines) | opus | - | v0.1
S4 substitutions table v1 (400+ entries, schema + tests) | ingest | RUNNING | opus | orch/briefs/S4-substitutions.md | v0.1
S5 diet + equipment + one-pot taggers, planted-trap fixtures | ingest | after S3 | sonnet | - | v0.1
S6 matcher engine "what can I cook" + substitution-aware ranking | app | after S2,S3 | opus | - | v0.2
S7 planner + grocery aggregation (1.5/person) | app | after S6 | sonnet | - | v0.2
