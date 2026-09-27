import type { DraftIngredientLine } from '../../corpus/draft'
import type { MyRecipeIngredientLine } from './types'

export interface ChangedIngredient {
  ingredient: string
  parent: { quantity: number | null; unit: string | null }
  fork: { quantity: number | null; unit: string | null }
}

export interface ChangedStep {
  index: number
  parent: string | null
  fork: string | null
}

export interface RecipeDiff {
  ingredientsAdded: MyRecipeIngredientLine[]
  ingredientsRemoved: DraftIngredientLine[]
  ingredientsChanged: ChangedIngredient[]
  stepsChanged: ChangedStep[]
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

export interface DiffableRecipe {
  ingredients: { canonicalIngredient: string; quantity: number | null; unit: string | null }[]
  steps: string[]
}

/**
 * Diff a fork against its parent (brief S7a #4): ingredients added, removed and changed by
 * quantity/unit, matched by canonical ingredient name; steps changed, matched by position.
 */
export function diffRecipes(parent: DiffableRecipe, fork: DiffableRecipe): RecipeDiff {
  const parentByName = new Map(
    parent.ingredients.map((line) => [normalizeName(line.canonicalIngredient), line]),
  )
  const forkByName = new Map(
    fork.ingredients.map((line) => [normalizeName(line.canonicalIngredient), line]),
  )

  const ingredientsAdded = fork.ingredients.filter(
    (line) => !parentByName.has(normalizeName(line.canonicalIngredient)),
  ) as MyRecipeIngredientLine[]

  const ingredientsRemoved = parent.ingredients.filter(
    (line) => !forkByName.has(normalizeName(line.canonicalIngredient)),
  ) as DraftIngredientLine[]

  const ingredientsChanged: ChangedIngredient[] = []
  for (const [name, parentLine] of parentByName) {
    const forkLine = forkByName.get(name)
    if (!forkLine) continue
    if (parentLine.quantity !== forkLine.quantity || parentLine.unit !== forkLine.unit) {
      ingredientsChanged.push({
        ingredient: parentLine.canonicalIngredient,
        parent: { quantity: parentLine.quantity, unit: parentLine.unit },
        fork: { quantity: forkLine.quantity, unit: forkLine.unit },
      })
    }
  }

  const stepsChanged: ChangedStep[] = []
  const maxSteps = Math.max(parent.steps.length, fork.steps.length)
  for (let i = 0; i < maxSteps; i++) {
    const parentStep = parent.steps[i] ?? null
    const forkStep = fork.steps[i] ?? null
    if (parentStep !== forkStep) {
      stepsChanged.push({ index: i, parent: parentStep, fork: forkStep })
    }
  }

  return { ingredientsAdded, ingredientsRemoved, ingredientsChanged, stepsChanged }
}
