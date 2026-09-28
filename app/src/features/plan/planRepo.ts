import { getUserDb } from '../../db'
import { newId } from '../myRecipes/id'

/** Where a plan entry's recipe id resolves: corpus.db's `recipes.key`, a fixture id (r01..r20,
 * the draft stand-in), or a `my_recipes.id`. */
export type RecipeSource = 'corpus' | 'fixture' | 'my'

export const MEALS = ['breakfast', 'lunch', 'dinner'] as const
export type Meal = (typeof MEALS)[number]

export interface PlanEntry {
  id: string
  /** ISO date (YYYY-MM-DD) of the day this entry falls on. */
  day: string
  meal: Meal
  recipeId: string
  recipeSource: RecipeSource
  recipeTitle: string
  people: number
}

interface PlanEntryRow {
  id: string
  day: string
  meal: Meal
  recipe_id: string | null
  recipe_source: RecipeSource
  recipe_title: string
  people: number
}

function toEntry(row: PlanEntryRow): PlanEntry {
  return {
    id: row.id,
    day: row.day,
    meal: row.meal,
    recipeId: row.recipe_id ?? '',
    recipeSource: row.recipe_source,
    recipeTitle: row.recipe_title,
    people: row.people,
  }
}

/** Monday (ISO, local) of the week `date` falls in. Weeks run Monday-Sunday. */
export function mondayOf(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dow = d.getDay() // 0 = Sunday
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return isoDate(d)
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/** The 7 ISO dates of the week starting `weekStart` (Monday). */
export function weekDays(weekStart: string): string[] {
  const [y, m, d] = weekStart.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    return isoDate(day)
  })
}

export function nextWeekStart(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  const next = new Date(y, m - 1, d + 7)
  return isoDate(next)
}

export function previousWeekStart(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  const prev = new Date(y, m - 1, d - 7)
  return isoDate(prev)
}

/** Finds (or creates) the plan row for a Monday-starting week, returning its id. */
export async function getOrCreatePlan(weekStart: string): Promise<string> {
  const db = await getUserDb()
  const existing = await db.query<{ id: string }>('SELECT id FROM plans WHERE week_start = ?', [
    weekStart,
  ])
  if (existing.rows[0]) return existing.rows[0].id
  const id = newId('plan')
  await db.run('INSERT INTO plans (id, week_start) VALUES (?, ?)', [id, weekStart])
  return id
}

export async function listPlanEntries(weekStart: string): Promise<PlanEntry[]> {
  const db = await getUserDb()
  const { rows } = await db.query<PlanEntryRow>(
    `SELECT e.id, e.day, e.meal, e.recipe_id, e.recipe_source, e.recipe_title, e.people
       FROM plan_entries e
       JOIN plans p ON p.id = e.plan_id
      WHERE p.week_start = ?
      ORDER BY e.day, e.meal`,
    [weekStart],
  )
  return rows.map(toEntry)
}

export interface NewPlanEntry {
  weekStart: string
  day: string
  meal: Meal
  recipeId: string
  recipeSource: RecipeSource
  recipeTitle: string
  people: number
}

export async function addPlanEntry(entry: NewPlanEntry): Promise<string> {
  const db = await getUserDb()
  const planId = await getOrCreatePlan(entry.weekStart)
  const id = newId('entry')
  await db.run(
    `INSERT INTO plan_entries
       (id, plan_id, day, meal, recipe_id, recipe_source, recipe_title, people)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, planId, entry.day, entry.meal, entry.recipeId, entry.recipeSource, entry.recipeTitle, entry.people],
  )
  return id
}

export async function movePlanEntry(id: string, day: string, meal: Meal): Promise<void> {
  const db = await getUserDb()
  await db.run('UPDATE plan_entries SET day = ?, meal = ? WHERE id = ?', [day, meal, id])
}

export async function setPlanEntryPeople(id: string, people: number): Promise<void> {
  const db = await getUserDb()
  await db.run('UPDATE plan_entries SET people = ? WHERE id = ?', [people, id])
}

export async function removePlanEntry(id: string): Promise<void> {
  const db = await getUserDb()
  await db.run('DELETE FROM plan_entries WHERE id = ?', [id])
}

/** Every plan entry between two ISO dates (inclusive), across however many weeks that spans —
 * used by the grocery build, which works from a date range rather than one week. */
export async function listPlanEntriesInRange(from: string, to: string): Promise<PlanEntry[]> {
  const db = await getUserDb()
  const { rows } = await db.query<PlanEntryRow>(
    `SELECT id, day, meal, recipe_id, recipe_source, recipe_title, people
       FROM plan_entries
      WHERE day BETWEEN ? AND ?
      ORDER BY day, meal`,
    [from, to],
  )
  return rows.map(toEntry)
}
