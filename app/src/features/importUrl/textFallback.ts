import { emptyImportedRecipe, type ImportedRecipe } from './types'

/**
 * "If there is no structured data, heuristically split plain pasted text into ingredients and
 * steps" (S12 brief #1) — the last resort, once neither JSON-LD nor microdata gave a `Recipe`.
 * Two passes:
 *   1. Explicit section headings ("Ingredients", "Instructions"/"Method"/"Directions"/"Steps"),
 *      the shape most people paste a recipe in. Whatever comes before the first heading is a
 *      candidate title.
 *   2. No headings found: classify each line on its own shape — a short, quantity-led line
 *      ("2 cups flour") is an ingredient; a longer, sentence-like or numbered line ("1. Preheat
 *      the oven to 350F.") is a step. The first line is the title unless it looks like either.
 */

const INGREDIENTS_HEADING_RE = /^\s*ingredients?\s*:?\s*$/i
const STEPS_HEADING_RE = /^\s*(?:instructions?|directions?|method|steps?|preparation)\s*:?\s*$/i

const QUANTITY_START_RE =
  /^\s*(?:\d+[\d\s/.\-–]*|[¼½¾⅓⅔⅛⅜⅝⅞]|(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|dozen|half|pinch|dash|handful)\b)/i

const UNIT_RE =
  /\b(cups?|tbsp|tablespoons?|tsp|teaspoons?|grams?|g|kg|ml|liters?|litres?|l|oz|ounces?|pounds?|lbs?|cloves?|cans?|jars?|packages?|pinch(?:es)?|slices?|pieces?|bunch(?:es)?|sprigs?|stalks?|heads?)\b/i

const STEP_VERB_RE =
  /^\s*(?:preheat|heat|mix|combine|whisk|stir|add|pour|bake|cook|boil|simmer|roast|grill|fry|saute|sauté|chop|slice|dice|mince|season|serve|let|cover|remove|place|arrange|drain|blend|beat|fold|knead|garnish|top|repeat|set|reduce|transfer|spread|layer|toss|marinate|chill|refrigerate|rest)\b/i

const NUMBERED_STEP_RE = /^\s*(?:step\s*)?\d+[.):]\s+\S/i

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*•▪◦]|\d+[.)]|\d+\s*[-–])\s*/, '').trim()
}

function looksLikeIngredient(line: string): boolean {
  const stripped = stripBullet(line)
  if (NUMBERED_STEP_RE.test(line) && STEP_VERB_RE.test(stripped)) return false
  if (QUANTITY_START_RE.test(stripped) || UNIT_RE.test(stripped)) {
    // "2 large eggs, beaten" is an ingredient; "2. Preheat the oven" is a step even though it
    // starts with a number, so a leading verb still wins.
    return !STEP_VERB_RE.test(stripped) || stripped.split(/\s+/).length <= 6
  }
  return false
}

function looksLikeStep(line: string): boolean {
  const stripped = stripBullet(line)
  if (STEP_VERB_RE.test(stripped)) return true
  if (NUMBERED_STEP_RE.test(line)) return true
  // A long, sentence-like line ending in a period reads as an instruction, not an ingredient.
  return stripped.length > 40 && /[.!]\s*$/.test(stripped)
}

function splitByHeadings(lines: string[]): ImportedRecipe | null {
  const ingredientsAt = lines.findIndex((l) => INGREDIENTS_HEADING_RE.test(l))
  const stepsAt = lines.findIndex((l) => STEPS_HEADING_RE.test(l))
  if (ingredientsAt === -1 && stepsAt === -1) return null

  const recipe = emptyImportedRecipe(null)
  const firstHeading = [ingredientsAt, stepsAt].filter((i) => i >= 0).sort((a, b) => a - b)[0]
  const title = lines
    .slice(0, firstHeading)
    .find((l) => l.trim() !== '')
    ?.trim()
  recipe.title = title ? title.replace(/^#+\s*/, '') : null

  if (ingredientsAt >= 0) {
    const end = stepsAt > ingredientsAt ? stepsAt : lines.length
    recipe.ingredients = lines
      .slice(ingredientsAt + 1, end)
      .map(stripBullet)
      .filter(Boolean)
  }
  if (stepsAt >= 0) {
    const end = ingredientsAt > stepsAt ? ingredientsAt : lines.length
    recipe.steps = lines
      .slice(stepsAt + 1, end)
      .map(stripBullet)
      .filter(Boolean)
  }
  return recipe
}

function splitByLineShape(lines: string[]): ImportedRecipe {
  const recipe = emptyImportedRecipe(null)
  let rest = lines
  const first = lines.find((l) => l.trim() !== '')
  if (first && !looksLikeIngredient(first) && !looksLikeStep(first)) {
    recipe.title = first.trim()
    rest = lines.slice(lines.indexOf(first) + 1)
  }
  for (const line of rest) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (looksLikeStep(trimmed)) recipe.steps.push(stripBullet(trimmed))
    else if (looksLikeIngredient(trimmed)) recipe.ingredients.push(stripBullet(trimmed))
    // A line that reads as neither (a blank divider, "For the sauce:") is dropped rather than
    // guessed at; the editor's "Not understood" marking is for the parser, not this heuristic.
  }
  return recipe
}

/** Splits pasted plain text (no HTML) into an `ImportedRecipe`. Never returns null: worst case,
 * every line the shape heuristic could not place is simply left out. */
export function parsePlainTextRecipe(text: string): ImportedRecipe {
  const lines = text.split(/\r?\n/)
  return splitByHeadings(lines) ?? splitByLineShape(lines)
}
