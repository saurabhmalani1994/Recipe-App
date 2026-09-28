-- "What can I cook?": recipes covering most of the cook's ingredients, filtered by diet,
-- equipment, one-pot, cuisine and time. The app runs this against corpus.db; S6 owns the ranking
-- on top of it (substitution-aware "missing, but a substitute works").
--
-- Parameters (NULL switches a filter off):
--   :have         JSON array of slugs the cook has. The app expands it before binding: staples
--                 need not be listed (they are never core), and a variety covers its parent
--                 (roma_tomato -> tomatoes) through ingredients.parent.
--   :diet         'vegetarian' | 'no_red_meat' | NULL for Everything. adaptable counts, with
--                 recipe_diet.swaps saying how.
--   :kitchen      JSON array of the equipment the kitchen has, or NULL for no equipment filter.
--                 A recipe passes when it needs nothing outside the kitchen, where owning any one
--                 member of an either/or group (recipe_equipment_alternatives) covers the group.
--   :one_pot      1 for "one pot meals": one_pot AND course = 'main' (ruling R9).
--   :cuisine      a Cuisine.
--   :max_min      total minutes; a recipe with unknown time does not pass.
--   :max_missing  the most core ingredients a result may lack (the UI shows "missing 1-2"). An
--                 ingredient line the parser could not resolve counts as missing, since the cook
--                 cannot be shown to have it.
--   :limit        rows to return.
WITH have (slug) AS (
  SELECT DISTINCT value FROM json_each(:have)
),
hits AS (
  SELECT rs.recipe_id, count(*) AS matched
  FROM have
  JOIN recipe_slugs AS rs ON rs.slug = have.slug
  WHERE rs.core = 1
  GROUP BY rs.recipe_id
)
SELECT
  r.id,
  r.key,
  r.title,
  r.course,
  r.cuisine,
  r.total_min,
  hits.matched,
  r.core_slug_count - hits.matched + r.unresolved_count AS missing,
  d.status AS diet_status
FROM hits
JOIN recipes AS r ON r.id = hits.recipe_id
LEFT JOIN recipe_diet AS d ON d.recipe_id = r.id AND d.preset = :diet
WHERE (:diet IS NULL OR d.status IN ('ok', 'adaptable'))
  AND (:one_pot IS NULL OR (r.one_pot = 1 AND r.course = 'main'))
  AND (:cuisine IS NULL OR r.cuisine = :cuisine)
  AND (:max_min IS NULL OR r.total_min <= :max_min)
  AND (:max_missing IS NULL OR r.core_slug_count - hits.matched + r.unresolved_count <= :max_missing)
  AND (:kitchen IS NULL OR NOT EXISTS (
    SELECT 1
    FROM recipe_equipment AS e
    WHERE e.recipe_id = r.id
      AND e.equipment NOT IN (SELECT value FROM json_each(:kitchen))
      AND NOT EXISTS (
        SELECT 1
        FROM recipe_equipment_alternatives AS a
        JOIN recipe_equipment_alternatives AS b ON b.recipe_id = a.recipe_id AND b.grp = a.grp
        WHERE a.recipe_id = r.id
          AND a.equipment = e.equipment
          AND b.equipment IN (SELECT value FROM json_each(:kitchen))
      )
  ))
ORDER BY missing, hits.matched * 1.0 / r.core_slug_count DESC, r.quality DESC, r.id
LIMIT :limit;
