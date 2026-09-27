# Brief S4: substitutions table v1 (the owner's focus feature)
From the orchestrator, release v0.1. Owner words (D7), verbatim: "the substitutions table would
be AMAZING - make a good focus of this, for all sorts of things, soy sauce, worstershire sauce,
apple cider vinegar - just examples not exhaustive - i cook ALL KINDS of food". Also D5 (diet
presets: Vegetarian, No red meat = fish and poultry OK).
Base: claude/funny-thompson-jcmpox. Scope: `ingest/subs/` only.
Model: strong. Effort: high.

Deliverable:
1 `ingest/subs/ingredients.yaml` holds every ingredient slug the table uses, with category and
  diet flags: red_meat, poultry, fish, shellfish, animal_derived (e.g. gelatin, lard, fish in
  sauces), dairy, egg, gluten, nuts, alcohol, and a hidden_animal note. This mirrors locally
  the canonical taxonomy the parser slice will own later, so keep slugs simple, lowercase and
  snake_case.
2 `ingest/subs/substitutions.yaml` with at least 400 entries. Each entry has: id, target slug,
  a substitute as a list of components {slug, amount per 1 unit of target, unit}, plus an
  optional method note (e.g. "let stand 5 min"). It also has contexts (from baking, sauce,
  marinade, dressing, stir_fry, braise, soup, frying, garnish, dessert, beverage, any), quality
  1-3 (3 = hard to tell apart), flavor_effect (one line), and cuisines where it's apt.
  Coverage must span sauces and condiments (soy, Worcestershire, fish sauce, oyster, hoisin,
  gochujang, miso...), vinegars and acids (apple cider vinegar, rice vinegar, sherry, tamarind,
  amchur...), dairy and non-dairy, eggs, flours and thickeners, leaveners, sugars and
  sweeteners, fats, fresh and dried herbs, whole and ground spices and blends (garam masala,
  five spice, za'atar, ras el hanout...), aromatics, chiles, alcohol in cooking, stocks,
  proteins where a swap is sensible, and regional pantry items for Indian, Chinese, Japanese,
  Korean, Thai, Vietnamese, Mexican, Middle Eastern, Mediterranean, Italian, French and
  American cooking. A target may have several entries of different quality. Use only
  well-established culinary equivalences. Where a ratio is uncertain, lower the quality score
  and say so in the note; never invent precision.
3 Diet correctness is enforced in code (rule 12). `ingest/subs/validate.py` computes each
  substitute's diet flags from its components and never takes them from hand-written claims.
  It fails on unknown slugs, missing fields, duplicate ids, a quality outside 1-3, or empty
  contexts. It also reports, per target, whether a Vegetarian-safe and a No-red-meat-safe
  option exists.
4 pytest with planted traps: Worcestershire is not vegetarian (anchovy), fish sauce is not
  vegetarian but is OK for No red meat, beef stock is red meat, and gelatin is animal-derived.
  There must be a vegetarian Worcestershire alternative, and the owner's three examples must
  each have at least 3 entries.
5 `ingest/subs/COVERAGE.md` gives counts per category and cuisine, and lists the targets with
  no vegetarian-safe option.
Out of scope: UI, the parser, and matching into recipes.
Checks: validator 0 errors, pytest counts.
Report per ORCHESTRATION §6 plus 8 entries verbatim (the owner's 3 examples and 5 random ones).
