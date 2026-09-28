import { CUISINE_VALUES, type Cuisine } from '../../corpus/types'

/** Free-text `recipeCuisine` values (schema.org gives no fixed vocabulary) that don't already
 * match a `Cuisine` slug by substring. */
const ALIASES: Record<string, Cuisine> = {
  british: 'british_irish',
  irish: 'british_irish',
  uk: 'british_irish',
  english: 'british_irish',
  german: 'german_central_eu',
  austrian: 'german_central_eu',
  swiss: 'german_central_eu',
  polish: 'german_central_eu',
  malaysian: 'indonesian_malaysian',
  indonesian: 'indonesian_malaysian',
  arab: 'middle_eastern',
  arabic: 'middle_eastern',
  lebanese: 'middle_eastern',
  israeli: 'middle_eastern',
  moroccan: 'north_african',
  tunisian: 'north_african',
  algerian: 'north_african',
  egyptian: 'north_african',
  african: 'east_west_african',
  nigerian: 'east_west_african',
  ethiopian: 'east_west_african',
  'tex-mex': 'mexican',
  'tex mex': 'mexican',
  'us': 'american',
  'u.s.': 'american',
  cajun: 'southern_us',
  creole: 'southern_us',
}

/** Maps a page's free-text `recipeCuisine`/`recipeCategory` to a `Cuisine`, or null when nothing
 * recognisable is in it (never guessed — the owner can always set it by hand in the editor). */
export function matchCuisine(text: string | null): Cuisine | null {
  if (!text) return null
  const norm = text.toLowerCase().trim()
  for (const value of CUISINE_VALUES) {
    if (norm.includes(value.replace(/_/g, ' '))) return value
  }
  for (const [alias, value] of Object.entries(ALIASES)) {
    if (norm.includes(alias)) return value
  }
  return null
}
