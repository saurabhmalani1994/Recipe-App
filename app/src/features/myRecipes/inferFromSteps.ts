import { EQUIPMENT_VALUES, type Equipment } from '../../corpus/types'

/**
 * S12b brief #3 (R13): "infer [total minutes / one-pot / equipment] from the steps where the
 * user left them empty ... port the smallest useful part of ingest/tag/equipment.py and
 * timing.py: keyword equipment and summed 'N minutes'". This is a small, one-way TS port for
 * suggestions the editor offers the owner to accept — not the corpus tagger itself (that stays
 * a full-text, context-aware pass over `ingest/tag/{equipment,timing}.py`, run once at corpus
 * build time; a My Recipe has no such build step, and re-deriving its full sophistication for a
 * handful of hand-typed steps was judged not worth the false-positive risk — e.g. no attempt at
 * telling "bake" apart from "baking soda", or an aside like "can be reheated in the oven"). A
 * suggestion here is a starting point the owner reviews and accepts, never written silently.
 */

/** Keyword equipment: one regex per `Equipment` value, simple substring/word matches only (no
 * negative-lookahead disambiguation the way `ingest/tag/equipment.py`'s TERMS table has). Every
 * `EQUIPMENT_VALUES` entry is covered so the editor's suggestion list can never silently miss
 * one it has no rule for. */
const EQUIPMENT_KEYWORDS: Record<Equipment, RegExp> = {
  oven: /(?<!toaster )(?<!toaster-)\boven\b|\bgas mark\b/i,
  stovetop: /\bstove ?top\b|\bhob\b|\bskillet\b|\bfrying pan\b|\bfry pan\b|\bsaucepan\b|\bsimmer|\bsaut[ée]|\bstir[- ]?fry|\bboil|\bfry\b|\bfried\b|\bfrying\b/i,
  microwave: /\bmicrowave\b/i,
  grill: /\bgrill\b|\bbarbecue\b|\bbbq\b/i,
  broiler: /\bbroiler\b|\bbroil(?:ing|ed)?\b/i,
  air_fryer: /\bair[- ]?fryer\b|\bair[- ]?fry(?:ing|ied)?\b/i,
  slow_cooker: /\bslow[- ]?cooker\b|\bcrock[- ]?pot\b/i,
  pressure_cooker: /\bpressure[- ]?cooker\b|\binstant ?pot\b/i,
  rice_cooker: /\brice[- ]?cooker\b/i,
  deep_fryer: /\bdeep[- ]?fryer\b|\bdeep[- ]?fry(?:ing|ied)?\b/i,
  smoker: /\bsmoker\b/i,
  toaster: /\btoaster\b(?!\s*oven)/i,
  toaster_oven: /\btoaster[- ]oven\b/i,
  sous_vide: /\bsous[- ]?vide\b/i,
  waffle_iron: /\bwaffle (?:iron|maker)\b/i,
  bread_machine: /\bbread (?:machine|maker)\b/i,
  dehydrator: /\bdehydrator\b/i,
  campfire: /\bcampfire\b/i,
  steamer: /\bsteamer\b|\bsteamer basket\b/i,
  food_processor: /\bfood[- ]processor\b/i,
  blender: /(?<!immersion )(?<!stick )(?<!hand )\bblenders?\b/i,
  immersion_blender: /\bimmersion blender\b|\bstick blender\b|\bhand blender\b/i,
  mortar_pestle: /\bmortar (?:and|&) pestle\b|\bpestle\b/i,
  wok: /\bwok\b/i,
  stand_mixer: /\bstand[- ]mixer\b/i,
  hand_mixer: /\bhand[- ]?mixer\b|\belectric (?:hand )?(?:mixer|whisk|beaters?)\b/i,
  dutch_oven: /\bdutch oven\b/i,
  cast_iron: /\bcast[- ]?iron\b/i,
  sheet_pan: /\bsheet pan\b|\bbaking (?:sheet|tray)\b/i,
  spice_grinder: /\b(?:spice|coffee) grinder\b/i,
  ice_cream_maker: /\bice[- ]cream (?:maker|machine)\b/i,
}

/** Keyword equipment found in the steps' text, sorted. Suggestion only — the editor shows it
 * for the owner to accept, it is never written to `MyRecipeData` on its own. */
export function inferEquipment(steps: string[]): Equipment[] {
  const text = steps.join(' \n ')
  const found: Equipment[] = []
  for (const equipment of EQUIPMENT_VALUES) {
    if (EQUIPMENT_KEYWORDS[equipment].test(text)) found.push(equipment)
  }
  return found
}

/** timing.py's number-word table, the ones plain-language steps actually use. */
const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  sixty: 60,
}

const NUMBER_WORD_RE = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|')
// "N minutes/mins/hours/hrs", "N-M minutes" (takes the upper end), "overnight" (= 8 hours).
const DURATION_RE = new RegExp(
  `(?<![\\w/])(?:(\\d+(?:\\.\\d+)?|${NUMBER_WORD_RE})\\s*(?:(?:-|to)\\s*(\\d+(?:\\.\\d+)?|${NUMBER_WORD_RE})\\s*)?(hours?|hrs?|h|minutes?|mins?|m)\\b|(overnight))`,
  'gi',
)
// Storage notes ("keeps for up to a month") aren't cook time; skip a sentence that names one.
const SKIP_RE = /\b(?:keeps?|will keep|store|stored|lasts?|shelf|up to \d+ (?:days?|weeks?|months?))\b/i

function num(token: string | undefined): number | null {
  if (token === undefined) return null
  const lower = token.toLowerCase()
  if (lower in NUMBER_WORDS) return NUMBER_WORDS[lower]
  const n = Number(lower)
  return Number.isFinite(n) ? n : null
}

/** Every duration named in one step's text, in minutes. */
function stepDurations(step: string): number[] {
  const out: number[] = []
  for (const sentence of step.split(/(?<=[.!?])\s+/)) {
    if (SKIP_RE.test(sentence)) continue
    for (const m of sentence.matchAll(DURATION_RE)) {
      if (m[4]) {
        out.push(480) // "overnight"
        continue
      }
      const lo = num(m[1])
      const hi = num(m[2])
      const unit = (m[3] ?? '').toLowerCase()
      const value = hi ?? lo
      if (value === null) continue
      const minutes = unit.startsWith('h') ? value * 60 : value
      if (minutes > 0 && minutes <= 60 * 24 * 3) out.push(minutes)
    }
  }
  return out
}

/** Summed "N minutes" across every step, timing.py's estimate minus the source-field lookup (a
 * My Recipe has no `total_time_min`/`prep_time_min`/`cook_time_min` to prefer) and the
 * prep-allowance/active-vs-passive split (not needed for a single total-minutes suggestion).
 * `null` when no step names a duration — there is nothing to suggest. */
export function inferTotalMinutes(steps: string[]): number | null {
  let total = 0
  let found = false
  for (const step of steps) {
    for (const minutes of stepDurations(step)) {
      total += minutes
      found = true
    }
  }
  return found ? Math.round(total) : null
}
