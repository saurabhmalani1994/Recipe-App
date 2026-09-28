# Raw recipe schema

Owned by `ingest`. Every fetcher emits JSONL (one JSON object per line, UTF-8) matching this
shape into `/home/user/recipe-data/raw/<source>/recipes.jsonl`. This is the *raw* format:
strings are kept as scraped/sourced, not yet normalized, deduped or unit-parsed. That is the
next slice's job.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Stable within the source: `<source>:<source-native-id-or-slug>`. |
| `source` | string | yes | One of the keys in `ingest/sources.md`, e.g. `recipenlg`, `foodcom`, `bbcgoodfood`. |
| `source_url` | string | no | Canonical URL if the source is web-scraped; omit for dataset dumps with no per-recipe URL. |
| `title` | string | yes | As given by the source. |
| `ingredients` | string[] | yes | Raw ingredient lines, unparsed (e.g. `"2 cups flour, sifted"`). Empty list allowed but flagged as a drop candidate downstream. |
| `steps` | string[] | yes | Instruction steps, one string per step, in order. |
| `cuisine_label` | string? | no | Source's own cuisine/region tag if present. |
| `category` | string? | no | Source's own category/course tag if present (e.g. "dessert", "main"). |
| `rating` | number? | no | Average rating, in the source's own scale (not normalized to 5 stars here). |
| `rating_count` | integer? | no | Number of ratings. |
| `total_time_min` | integer? | no | Total time in minutes if the source gives one figure. |
| `prep_time_min` | integer? | no | Prep time in minutes. |
| `cook_time_min` | integer? | no | Cook time in minutes. |
| `yield_text` | string? | no | Raw yield/servings string as given (e.g. `"Serves 4"`, `"makes 12 muffins"`). |
| `image_url` | string? | no | Primary image URL if present. |
| `tags` | string[] | no | Any other free-text tags/keywords the source exposes (diet, equipment, occasion, etc.), unparsed. |
| `video_url` | string? | no | The recipe's video (Food Wishes: the post's YouTube/Vimeo embed as a watch URL, R17). |

## Conventions

- Missing optional fields are omitted from the JSON object rather than written as `null`,
  to keep lines small. `ingredients` and `steps` are always present, even if empty (`[]`);
  a fetcher that would emit an empty-both record instead drops it and counts it in
  `sources.md`.
- One JSONL file per source at `/home/user/recipe-data/raw/<source>/recipes.jsonl`. Fetchers
  also write a `progress.json` (or similar) sidecar in the same directory recording what has
  been fetched so far, so a re-run resumes instead of re-fetching.
- `id` must be unique within a source's file; a fetcher skips (and counts) a record whose id
  it has already written this run.
- Text is kept as-is from the source, including HTML entities the source itself did not
  decode, except that fetchers do decode HTML entities and strip tags from ingredient/step
  text, since that is presentation noise, not content.
