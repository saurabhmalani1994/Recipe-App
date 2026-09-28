# Queue

`name | package | status | tier | brief file | target`

S1 source-fetch (datasets + schema.org scrape) | ingest | DONE (merged) | sonnet | orch/briefs/S1-source-fetch.md | v0.1
S2 app scaffold: Vite+React+TS, Capacitor, sqlite, CI APK, commit hook | app | DONE 3639216 | sonnet | orch/briefs/S2-app-scaffold.md | v0.1
S3 ingredient-line parser + canonical taxonomy | ingest | DONE (merged) | opus | orch/briefs/S3-parser-taxonomy.md | v0.1
S4 substitutions table v1 (400+ entries, schema + tests) | ingest | DONE (merged) | opus | orch/briefs/S4-substitutions.md | v0.1
S5a diet/equipment/one-pot/time taggers | ingest | DONE merged | opus | orch/briefs/S5a-diet-equipment.md |
S5b cuisine classifier + seasonality | ingest | DONE merged, BAR MISSED (68.6%/23.9%) | sonnet | orch/briefs/S5b-cuisine-season.md |
S5b-2 cuisine data expansion (2nd attempt, same tier) | ingest | DONE merged, bar PASSED narrowly | sonnet | orch/briefs/S5b2-cuisine-data.md |
S7a settings, kitchen, favorites, my recipes + forks | app | DONE merged | sonnet | orch/briefs/S7a-user-features.md | v0.1
S6 matcher engine + Cook screen + units | app | DONE merged | opus | orch/briefs/S6-matcher.md | v0.2
S7 planner + grocery + shopping mode | app | RUNNING | sonnet | orch/briefs/S7-planner-grocery.md | v0.2
S8 curation: dedupe + quality + select ~80k + full build | ingest | RUNNING | opus | orch/briefs/S8-curation.md | v0.1
S9 corpus.db build + FTS5 + schema/corpus.sql | ingest | after S8 | opus | - | v0.1
S7b UI polish: the recipe editor ingredient row overflows at 412px (3rd field cut off, seen in the screenshot); the qty/unit fields are too wide; OPFS persistence instead of the localStorage snapshot | app | DONE merged | sonnet | orch/briefs/S7b-ui-polish.md | v0.1
S3b taxonomy/subs/parser fixups from S5a | ingest | DONE merged | sonnet | orch/briefs/S3b-fixups.md | v0.1
S9a corpus.db schema + builder on sample + course tagger + app types/fixture | ingest+app types | DONE merged | opus | orch/briefs/S9a-corpus-schema.md | v0.1
S9b course tagger modifier rules; blind set must be >= 85% (it was 82%) | ingest | READY after S8 | sonnet | - | v0.1
S9c parser: 'cans tuna packed in water' resolves to water | ingest | fold into next parser slice | sonnet | - | v0.1
S6b Cook fixes: flaky diet persistence, equipment list drift, readability, ranking floor | app | RUNNING | sonnet | orch/briefs/S6b-cook-fixes.md | v0.1
