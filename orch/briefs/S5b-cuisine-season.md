# Brief S5b: cuisine classifier and seasonality
From the orchestrator, release v0.1. Owner words: "choose a cuisine style (e.g. indian,
mediterranean, chinese, italian, etc. etc.)" and the home rows in D12 (explore new cuisines,
seasonal). Read docs/DECISIONS.md D12 only.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/cuisine/` (new) only. Use `ingest.parse`
and `ingest.taxonomy` as libraries; do not edit them.
Model: mid. Effort: high.

Deliverable:
1 A fixed list of cuisines, around 25 of them. It should include indian (with optional regional
  sub-labels), chinese, japanese, korean, thai, vietnamese, filipino, indonesian_malaysian,
  middle_eastern, persian, turkish, greek, italian, french, spanish, mediterranean (as an
  umbrella), mexican, latin_american, caribbean, american, southern_us, british_irish, german_central_eu,
  north_african, east_west_african, and fusion/other. Store a map from each source's labels to
  this list.
2 A deterministic classifier over canonical ingredient slugs plus title tokens. It can be
  trained offline (scikit-learn is fine), with the model saved as a small JSON of weights or a
  pickle under 20 MB, whichever is simpler. The training data is recipes whose source labels
  map to the list (themealdb area, bbcgoodfood cuisine, openrecipes and recipenlg where a label
  exists, and more if you find it). It outputs the top label and a confidence. Below a
  threshold it returns `unknown` rather than guess.
3 The bar, written before the first run: top-1 accuracy >= 80% on held-out labelled recipes
  among those not returned as unknown, with unknown <= 30%. Report the confusion between the
  closest pairs (e.g. greek/mediterranean, chinese/other east asian). Also label 100 recipes by
  hand to check that the classifier transfers to the unlabelled sources.
4 Seasonality: `ingest/cuisine/season.yaml` maps produce slugs to peak months for a
  temperate northern hemisphere (the default; the owner's location is not yet known). Add a
  function that returns each recipe's in-season key produce for a given month.
5 A run over 20k raw recipes. Report the label distribution and the unknown rate by source.
Out of scope: diet, equipment, and corpus.db.
Checks: pytest counts and scores. Report per §6 plus 8 classified recipes verbatim (title,
label, confidence), including 2 wrong ones.
