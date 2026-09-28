import type { Db } from '../../db/types'

export interface Coverage {
  covered: number
  needed: number
}

interface CoverageRow {
  id: number
  core_slug_count: number
  unresolved_count: number
  matched: number
}

/**
 * "you have 7/9" for a fixed set of candidate recipe ids, against the current kitchen (`have`,
 * already expanded with staples and parent/child slugs — `taxonomy.ts`'s `expandHave`). Every
 * Home row computes this the same way regardless of how it picked its candidates, so it can be
 * shared instead of going through `engine.ts`'s full match (which also applies filters the row
 * itself may not want).
 */
export async function loadCoverage(
  db: Db,
  have: ReadonlySet<string>,
  recipeIds: readonly number[],
): Promise<Map<number, Coverage>> {
  const out = new Map<number, Coverage>()
  if (recipeIds.length === 0) return out
  const { rows } = await db.query<CoverageRow>(
    `SELECT r.id, r.core_slug_count, r.unresolved_count,
        (SELECT count(*) FROM recipe_slugs rs
           WHERE rs.recipe_id = r.id AND rs.core = 1
             AND rs.slug IN (SELECT value FROM json_each(?))) AS matched
       FROM recipes r
      WHERE r.id IN (SELECT value FROM json_each(?))`,
    [JSON.stringify([...have]), JSON.stringify(recipeIds)],
  )
  for (const row of rows) {
    out.set(row.id, { covered: row.matched, needed: row.core_slug_count + row.unresolved_count })
  }
  return out
}
