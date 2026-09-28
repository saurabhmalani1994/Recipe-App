import { getUserDb } from '../../db'
import { FIXTURE_RECIPES } from '../../corpus/fixture'
import type { Recipe } from '../../corpus/model'
import { diffRecipes, type RecipeDiff } from './diff'
import { newId } from './id'
import type { MyRecipe, MyRecipeData } from './types'

interface MyRecipeRow {
  id: string
  title: string
  data: string
  created_at: string
  updated_at: string
}

interface ForkRow {
  id: string
  parent_recipe_id: string
  diff: string
  created_at: string
  updated_at: string
}

function toMyRecipe(row: MyRecipeRow, fork: ForkRow | undefined): MyRecipe {
  return {
    id: row.id,
    title: row.title,
    data: JSON.parse(row.data) as MyRecipeData,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    parentRecipeId: fork?.parent_recipe_id ?? null,
  }
}

async function getForkRow(id: string): Promise<ForkRow | undefined> {
  const db = await getUserDb()
  const result = await db.query<ForkRow>('SELECT * FROM recipe_forks WHERE id = ?', [id])
  return result.rows[0]
}

/** Looks a recipe up in the draft fixture (`corpus.db` stand-in, out of scope for this slice). */
export function findFixtureRecipe(id: string): Recipe | undefined {
  return FIXTURE_RECIPES.find((recipe) => recipe.id === id)
}

export async function listMyRecipes(): Promise<MyRecipe[]> {
  const db = await getUserDb()
  const rows = (await db.query<MyRecipeRow>('SELECT * FROM my_recipes ORDER BY updated_at DESC'))
    .rows
  const forks = (await db.query<ForkRow>('SELECT * FROM recipe_forks')).rows
  const forkById = new Map(forks.map((fork) => [fork.id, fork]))
  return rows.map((row) => toMyRecipe(row, forkById.get(row.id)))
}

export async function getMyRecipe(id: string): Promise<MyRecipe | undefined> {
  const db = await getUserDb()
  const result = await db.query<MyRecipeRow>('SELECT * FROM my_recipes WHERE id = ?', [id])
  const row = result.rows[0]
  if (!row) return undefined
  return toMyRecipe(row, await getForkRow(id))
}

/** The fork's diff against its parent, recomputed from the current parent + fork data. */
export async function getForkDiff(id: string): Promise<RecipeDiff | undefined> {
  const fork = await getForkRow(id)
  if (!fork) return undefined
  const parent = findFixtureRecipe(fork.parent_recipe_id)
  if (!parent) return undefined
  const myRecipe = await getMyRecipe(id)
  if (!myRecipe) return undefined
  return diffRecipes(parent, myRecipe.data)
}

export async function createMyRecipe(title: string, data: MyRecipeData): Promise<string> {
  const db = await getUserDb()
  const id = newId('my')
  const now = new Date().toISOString()
  await db.run(
    'INSERT INTO my_recipes (id, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, title, JSON.stringify(data), now, now],
  )
  return id
}

export async function updateMyRecipe(id: string, title: string, data: MyRecipeData): Promise<void> {
  const db = await getUserDb()
  const now = new Date().toISOString()
  await db.run('UPDATE my_recipes SET title = ?, data = ?, updated_at = ? WHERE id = ?', [
    title,
    JSON.stringify(data),
    now,
    id,
  ])
  const fork = await getForkRow(id)
  if (!fork) return
  const parent = findFixtureRecipe(fork.parent_recipe_id)
  if (!parent) return
  const diff = diffRecipes(parent, data)
  await db.run('UPDATE recipe_forks SET diff = ?, updated_at = ? WHERE id = ?', [
    JSON.stringify(diff),
    now,
    id,
  ])
}

export async function deleteMyRecipe(id: string): Promise<void> {
  const db = await getUserDb()
  await db.run('DELETE FROM recipe_forks WHERE id = ?', [id])
  await db.run('DELETE FROM my_recipes WHERE id = ?', [id])
}

function toMyRecipeData(parent: Recipe): MyRecipeData {
  return {
    servings: parent.servings,
    cuisine: parent.cuisine,
    tags: [],
    notes: '',
    ingredients: parent.ingredients.map((line) => ({ ...line })),
    steps: [...parent.steps],
  }
}

/** "Make my version": forks `parent` into My Recipes, linked by `parent_id` (recipe_forks). */
export async function forkRecipe(parent: Recipe): Promise<string> {
  const db = await getUserDb()
  const id = newId('fork')
  const now = new Date().toISOString()
  const data = toMyRecipeData(parent)
  const diff = diffRecipes(parent, data)
  await db.run(
    'INSERT INTO my_recipes (id, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, `${parent.title} (my version)`, JSON.stringify(data), now, now],
  )
  await db.run(
    'INSERT INTO recipe_forks (id, parent_recipe_id, diff, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, parent.id, JSON.stringify(diff), now, now],
  )
  return id
}
