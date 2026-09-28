/**
 * Deterministic ingredient-line parser: a line-for-line port of `ingest/parse/parser.py`, so a
 * line typed on the phone (My Recipes, forks, later "Import from URL") reads exactly as the same
 * line does in the corpus build.
 *
 * parseLine("1 (14 oz) can chickpeas, drained") ->
 *   [{ qty: 1, qty_max: null, unit: 'can', slug: 'chickpeas', raw_name: 'chickpeas',
 *      prep: 'drained', optional: false, note: null, pkg: { qty: 14, unit: 'oz' } }]
 *
 * The output conventions are the Python module's (see its docstring). Parity with the Python
 * output is enforced by `parity.test.ts` against a committed snapshot; any change here must keep
 * that test green, and any change to the Python parser must regenerate the snapshot
 * (`python3 scripts/gen_parse_snapshot.py`).
 *
 * Porting notes: patterns are kept in Python syntax and compiled by `pyRe` (Unicode `\w \s \d
 * \b`). Python's `None` is `null`; a dict `get` is a `has` check. Names mirror the Python ones
 * (snake_case in the output shape, camelCase for functions).
 */
import type { Unit } from '../corpus/types'
import { INGREDIENT_SLUGS } from '../corpus/slugs'
import tables from './tables.gen.json'
import { cleanText, hasCjk, normName, normTokens } from './normalize'
import {
  pyFloat,
  pyInt,
  pyLen,
  pyNumStr,
  pyRe,
  reEscape,
  reFullmatch,
  reMatch,
  reSearch,
  reSplit,
  reSub,
  round4,
  rstrip,
  splitWs,
  strip,
  type PyMatch,
} from './py'
import * as U from './units'

/** One ingredient named by a line. The shape of `parse_line`'s dicts, field for field. */
export interface ParsedItem {
  qty: number | null
  qty_max: number | null
  unit: Unit | null
  slug: string | null
  raw_name: string | null
  prep: string | null
  optional: boolean
  note: string | null
  pkg: { qty: number | null; unit: Unit | null } | null
}

const P = tables.parser
const FRACTIONS: Record<string, string> = P.FRACTIONS
const NUMBER_WORDS: Record<string, number | null> = P.NUMBER_WORDS
const LOST_SLASH: Record<string, number> = P.LOST_SLASH
const SIZE_WORDS: readonly string[] = P.SIZE_WORDS
const PREP_WORDS: ReadonlySet<string> = new Set(P.PREP_WORDS)
const STOP_SECOND_PART: ReadonlySet<string> = new Set(P.STOP_SECOND_PART)
const SPAN_STOP: ReadonlySet<string> = new Set(P.SPAN_STOP)
const CANNED_FORM: Record<string, string> = P.CANNED_FORM
const MEATLESS_WORDS: ReadonlySet<string> = new Set(P.MEATLESS_WORDS)

const has = U.has
const I = 'i'
const raw = String.raw

const NUM = raw`(?:\d+\s*-\s*\d+/\d+|\d+\s+\d+/\d+|\d+/\d+|\d*\.\d+|\d+)`
const RANGE_RE = raw`^(${NUM})(?:\s*(?:-|to|or)\s*(${NUM})(?![\d/]))?`
const UNIT_RE = raw`^\s*-?\s*(${U.UNIT_ALT})(\.?)(?=$|[^a-zA-Z])`
const PKG_PAREN_RE =
  raw`^\s*\(\s*(?:about\s+|approx\.?\s+)?(${NUM})(?:\s*(?:-|to)\s*(${NUM}))?\s*-?\s*` +
  raw`(${U.UNIT_ALT})\.?\s*(?:each|size|package|pkg|can|jar)?\.?\s*\)\.?`
const SIZE_SPEC_RE = raw`^\s*(${NUM})\s*-?\s*(?:(?:to|-)\s*(${NUM})\s*-?\s*)?(${U.UNIT_ALT})\.?(?=$|[^a-zA-Z])`
const ALT_MEASURE_RE = raw`^\s*/\s*${NUM}\s*(${U.UNIT_ALT})\.?(?=$|[^a-zA-Z])`
const OPTIONAL_RE =
  raw`\boptional(ly)?\b|\bif desired\b|\bif you like\b|\bif preferred\b|` +
  raw`\bif you wish\b|\bif available\b|\bif wanted\b`
const TASTE_RE = raw`\bto taste\b|\bgarnish|\bto decorate\b|\bfor decorat|\bas desired\b`
const HEADER_RE = raw`^(?:for\s+(?:the\s+)?[a-z][\w\s&\'-]*|[a-z][\w\s&\'()/-]*:)\s*:?\s*$`
const CLAUSE_RE =
  raw`(?:,\s*|\s+|^)(?:` +
  raw`for\s+\w.*|` +
  raw`to\s+(?:taste|serve|garnish|decorate|dust|coat|finish|brush|grease|fry|sprinkle|top|drizzle|` +
  raw`make|adjust|cover|thin|use|glaze|thicken|season|mix|rinse|soak|cook|dip|roll|spread|` +
  raw`fill|drain|bind|loosen|moisten|dot|line|oil|butter|flour|sweeten)\b.*|` +
  raw`as\s+(?:needed|required|desired|necessary)\b.*|` +
  raw`or\s+(?:as\s+needed|to\s+taste|as\s+desired)\b.*|or\s+(?:more|less|so)\s*$|` +
  raw`plus\s+(?:more|extra|additional|a\s+little|some|a\s+bit)\b.*|` +
  raw`if\s+(?:needed|necessary|desired|using|you\s+like|preferred|available)\b.*|` +
  raw`such\s+as\b.*|e\.g\.?.*|` +
  raw`divided(?:\s+use)?\b.*|` +
  raw`(?:at\s+)?room\s+temperature\s*$|` +
  raw`\(?optional\)?\s*$` +
  raw`)`

const g = (m: PyMatch, i: number): string | null => m.groups[i] ?? null

function num(tokIn: string): number | null {
  const tok = strip(tokIn)
  const m =
    reFullmatch(raw`(\d+)\s*-\s*(\d+)/(\d+)`, tok) ?? reFullmatch(raw`(\d+)\s+(\d+)/(\d+)`, tok)
  if (m) {
    const d = pyInt(g(m, 3) as string)
    return pyInt(g(m, 1) as string) + (d ? pyInt(g(m, 2) as string) / d : 0)
  }
  const m2 = reFullmatch(raw`(\d+)/(\d+)`, tok)
  if (m2) {
    const d = pyInt(g(m2, 2) as string)
    return d ? pyInt(g(m2, 1) as string) / d : null
  }
  return pyFloat(tok)
}

function cleanNumber(x: number | null): number | null {
  if (x === null) return null
  return round4(x)
}

// ---------------------------------------------------------------- taxonomy index

interface State {
  slugs: ReadonlySet<string>
  explicitMeat: ReadonlySet<string>
  index: Map<string, string>
  cjk: string[]
}

let STATE: State | null = null

/** The synonym index (`taxonomy.build_index`), built once from the slugs.json the app ships. */
function state(): State {
  if (STATE) return STATE
  const index = new Map<string, string>()
  const setDefault = (k: string, slug: string) => {
    if (k && !index.has(k)) index.set(k, slug)
  }
  for (const rec of INGREDIENT_SLUGS) {
    for (const s of [rec.name, ...rec.synonyms]) setDefault(normName(s), rec.slug)
    setDefault(normName(rec.slug.replaceAll('_', ' ')), rec.slug)
  }
  const cjk = [...index.keys()].filter((k) => hasCjk(k))
  cjk.sort((a, b) => pyLen(b) - pyLen(a))
  STATE = {
    slugs: new Set(INGREDIENT_SLUGS.map((r) => r.slug)),
    explicitMeat: new Set(INGREDIENT_SLUGS.filter((r) => r.explicitMeat).map((r) => r.slug)),
    index,
    cjk,
  }
  return STATE
}

type Resolved = [string | null, string | null]

/** (slug, matched key) for a name. Exact name first, then the longest contiguous run of words
 * that is a known name (rightmost on a tie), then CJK substring. */
export function resolve(text: string): Resolved {
  const st = state()
  const toks = normTokens(text)
  if (toks.length === 0) return [null, null]
  const key = toks.join(' ')
  const exact = st.index.get(key)
  if (exact !== undefined) return [exact, key]
  const n = toks.length
  for (let L = Math.min(n, 8); L > 0; L--) {
    for (let i = n - L; i >= 0; i--) {
      const k = toks.slice(i, i + L).join(' ')
      if (L === 1 && SPAN_STOP.has(k)) continue
      const hit = st.index.get(k)
      if (hit !== undefined) return [hit, k]
    }
  }
  if (hasCjk(text)) {
    const t = cleanText(text)
    for (const k of st.cjk) {
      if (t.includes(k)) return [st.index.get(k) as string, k]
    }
  }
  return [null, null]
}

// ---------------------------------------------------------------- text helpers

export function preclean(line: string): string {
  let s = line.replaceAll('Â', '').replaceAll('\xa0', ' ').replaceAll(' ', ' ')
  s = s.replaceAll('⁄', '/')
  for (const [ch, fr] of Object.entries(FRACTIONS)) {
    s = s.replace(
      pyRe(raw`(\d)?\s*` + reEscape(ch), 'g'),
      (_m, d: string | undefined) => (d ? d + ' ' : ' ') + fr + ' ',
    )
  }
  const pairs: [string, string][] = [
    ['–', '-'],
    ['—', '-'],
    ['‑', '-'],
    ['’', "'"],
    ['‘', "'"],
    ['“', '"'],
    ['”', '"'],
    ['（', '('],
    ['）', ')'],
    ['，', ','],
    ['：', ':'],
    ['®', ''],
    ['™', ''],
    ['©', ''],
    ['*', ''],
    ['\t', ' '],
  ]
  for (const [a, b] of pairs) s = s.replaceAll(a, b)
  s = reSub(raw`^\s*半`, '0.5 ', s)
  s = s.replaceAll('适量', ' to taste ').replaceAll('少许', ' to taste ')
  s = reSub(raw`\bnone\b`, ' ', s, I)
  s = reSub(raw`\bS\s*&\s*P\b`, 'salt and pepper', s)
  s = reSub(raw`^\s*[-•·▪●◦~]+\s*`, '', s)
  s = strip(reSub(raw`\s+`, ' ', s))
  return s
}

const HEADER_WORDS = new Set([
  'optional',
  'divided',
  'to serve',
  'to garnish',
  'garnish',
  'for serving',
  'for garnish',
  'topping',
  'toppings',
  'filling',
  'sauce',
  'crust',
  'glaze',
  'frosting',
  'icing',
  'dressing',
  'marinade',
  'batter',
  'dough',
  'streusel',
  'ingredients',
  'garnishes',
  'to decorate',
  'decoration',
  'assembly',
])

export function isHeader(s: string): boolean {
  if (reSearch(raw`\d`, s)) return false
  if (s.endsWith(':') && splitWs(s).length <= 8) return true
  const low = strip(s.toLowerCase(), ' .')
  if (HEADER_WORDS.has(low)) return true
  if (
    reMatch(raw`^to\s+(?:make|assemble|finish|moisten|prepare|cook)\b`, low) &&
    splitWs(s).length <= 8
  )
    return true
  return (
    reMatch(raw`^for\s+(the\s+)?[a-z]`, s, I) !== null &&
    splitWs(s).length <= 6 &&
    reMatch(HEADER_RE, s, I) !== null
  )
}

function popParens(sIn: string): [string, string[]] {
  let s = sIn
  const notes: string[] = []
  for (;;) {
    const m = reSearch(raw`\(([^()]*)\)`, s)
    if (!m) break
    const inner = strip(g(m, 1) as string)
    if (inner) notes.push(inner)
    s = s.slice(0, m.start) + ' ' + s.slice(m.end)
  }
  if (s.includes('(')) {
    const i = s.indexOf('(')
    const after = strip(s.slice(i + 1))
    if (after) notes.push(after)
    s = s.slice(0, i)
  }
  s = s.replaceAll(')', ' ')
  s = s.replaceAll('[', ' ').replaceAll(']', ' ')
  return [strip(reSub(raw`\s+`, ' ', s)), notes]
}

/** Cut trailing usage clauses ("for garnish", "to taste", "divided") into notes. */
function stripClauses(sIn: string): [string, string[]] {
  let s = sIn
  const notes: string[] = []
  let m = reSearch(CLAUSE_RE, s, I)
  while (m) {
    notes.push(strip(s.slice(m.start), ' ,;'))
    s = s.slice(0, m.start)
    m = reSearch(CLAUSE_RE, s, I)
  }
  return [strip(s, ' ,;:-'), notes]
}

function skipSizeWords(sIn: string, notes: string[]): string {
  let s = sIn
  let changed = true
  while (changed) {
    changed = false
    // "whole" is a size word only in front of a unit ("1 whole clove garlic"); otherwise it
    // belongs to the name ("whole wheat flour", "whole milk", "3 whole cloves")
    const m = reMatch(raw`^\s*whole\s+`, s, I)
    if (m) {
      const m2 = reMatch(UNIT_RE, s.slice(m.end), I)
      if (m2) {
        if (strip(s.slice(m.end + m2.end))) {
          s = s.slice(m.end)
          changed = true
          continue
        }
      }
    }
    for (const w of SIZE_WORDS) {
      const mw = reMatch(raw`^\s*` + reEscape(w) + raw`\b\.?\s*`, s, I)
      if (mw) {
        if (w !== 'whole') notes.push(w)
        s = s.slice(mw.end)
        changed = true
        break
      }
    }
  }
  return s
}

// ---------------------------------------------------------------- amount

interface Amount {
  qty: number | null
  qty_max: number | null
  unit: Unit | null
  pkg: ParsedItem['pkg']
  rest: string
  notes: string[]
  each: boolean
  to_taste: boolean
  unit_implicit_one: boolean
  unit_word: string | null
}

const MASS_OR_VOLUME = new Set([...Object.keys(U.MASS_G), ...Object.keys(U.VOLUME_ML)])
const TC = new Set(['t', 'T', 'c', 'C'])

/** Read the amount at the start of s. */
function parseAmount(sIn: string): Amount {
  const a: Amount = {
    qty: null,
    qty_max: null,
    unit: null,
    pkg: null,
    rest: sIn,
    notes: [],
    each: false,
    to_taste: false,
    unit_implicit_one: false,
    unit_word: null,
  }
  let s = strip(sIn)
  s = reSub(raw`^(?:or|and|about|approx\.?|approximately|around|roughly|~|ca\.?)\s+`, '', s, I)
  let m = reMatch(
    raw`^(to taste|to serve|for serving|to garnish|for garnish|garnish with|garnish|` +
      raw`for decoration|to decorate|optional)[:,]?\s+`,
    s,
    I,
  )
  if (m) {
    const w = (g(m, 1) as string).toLowerCase()
    a.notes.push(w)
    if (w.includes('taste') || w.includes('garnish') || w.includes('decor')) a.to_taste = true
    s = s.slice(m.end)
  }
  // number words
  m = reMatch(
    raw`^(a couple of|couple of|a couple|a half|half a|a few|one|two|three|four|five|six|` +
      raw`seven|eight|nine|ten|eleven|twelve|dozen|half|an|a)\b(?![-\'])\s*`,
    s,
    I,
  )
  let qty: number | null = null
  if (m && !reMatch(raw`^\d`, s)) {
    const w = (g(m, 1) as string).toLowerCase()
    if (has(NUMBER_WORDS, w) && NUMBER_WORDS[w] !== null) {
      qty = NUMBER_WORDS[w]
      s = s.slice(m.end)
    }
  }
  if (qty === null) {
    m = reMatch(RANGE_RE, s, I)
    if (m && !reMatch(raw`^\s*%`, s.slice(m.end))) {
      let lo = num(g(m, 1) as string)
      const hi = g(m, 2) ? num(g(m, 2) as string) : null
      let rest = s.slice(m.end)
      // lost slash: "1 12 teaspoons" = 1 1/2; "14 teaspoon" = 1/4
      const m2 = reMatch(
        raw`^\s+(\d\d)\s*(?=(?:tsp|teaspoon|tbsp|tablespoon|tbs|tbl|t\b|c\b|c\.|cup))`,
        rest,
        I,
      )
      const g1 = g(m, 1) as string
      if (hi === null && m2 && has(LOST_SLASH, g(m2, 1) as string) && reFullmatch(raw`\d+`, g1)) {
        lo = (lo as number) + LOST_SLASH[g(m2, 1) as string]
        rest = rest.slice(m2.end)
      } else if (hi === null && reFullmatch(raw`\d\d`, g1) && has(LOST_SLASH, g1)) {
        const m3 = reMatch(raw`^\s*(tsp|teaspoon|tbsp|tablespoon|tbs|tbl|cup|c\.)`, rest, I)
        if (m3 && !(g1 === '12' && (g(m3, 1) as string).toLowerCase().startsWith('c'))) {
          lo = LOST_SLASH[g1]
        }
      }
      qty = lo
      a.qty_max = hi
      s = rest
    }
  }
  if (qty !== null && reMatch(raw`^\s*to taste\b`, s, I)) {
    // "1 to taste salt": the number is a unit-less artefact of the source
    qty = null
    a.qty_max = null
    a.to_taste = true
    a.notes.push('to taste')
    s = reSub(raw`^\s*to taste\b\s*`, '', s, I)
  }
  m = reMatch(raw`^\s*(?:doz|dozen)\.?\b\s*`, s, I)
  if (qty !== null && m) {
    qty = qty * 12
    a.qty_max = a.qty_max !== null ? a.qty_max * 12 : null
    s = s.slice(m.end)
  }
  a.qty = qty
  // multiplier "2 x 400g cans"
  s = reSub(raw`^\s*x\s+`, ' ', s, I)
  let pkg: ParsedItem['pkg'] = null
  m = reMatch(PKG_PAREN_RE, s, I)
  if (m && qty !== null) {
    pkg = { qty: cleanNumber(num(g(m, 1) as string)), unit: U.lookup(g(m, 3) as string) }
    s = s.slice(m.end)
  }
  s = skipSizeWords(s, a.notes)
  let unit: Unit | null = null
  let unitWord: string | null = null
  m = reMatch(UNIT_RE, s, I)
  if (m) {
    const u = U.lookup(g(m, 1) as string)
    const after = s.slice(m.end)
    const w = g(m, 1) as string
    // a lone "t"/"c" needs a dot or a following word; "C" in "Cupcakes" never reaches here
    if (u && !(TC.has(w) && !(g(m, 2) || after.startsWith(' ')))) {
      if (!(
        U.FRONT_ONLY.has(u) &&
        qty === null &&
        !reMatch(raw`^\s*of\b`, after, I) &&
        u !== 'head'
      )) {
        unit = u
        unitWord = w
        a.each = w.toLowerCase() === 'each' || w.toLowerCase() === 'ea'
        s = after
      }
    }
  }
  if (unit === null && qty !== null && pkg === null) {
    // "Four 5- to 6-ounce steaks", "1 8 oz package pecans": a size, then maybe a container
    m = reMatch(SIZE_SPEC_RE, s, I)
    if (m && MASS_OR_VOLUME.has(U.lookup(g(m, 3) as string) ?? '')) {
      pkg = { qty: cleanNumber(num(g(m, 1) as string)), unit: U.lookup(g(m, 3) as string) }
      s = s.slice(m.end)
      s = reSub(raw`^\s*\([^)]*\)\.?`, '', s)
      s = skipSizeWords(s, a.notes)
      m = reMatch(UNIT_RE, s, I)
      if (m && U.CONTAINERS.has(U.lookup(g(m, 1) as string) ?? '')) {
        unit = U.lookup(g(m, 1) as string)
        s = s.slice(m.end)
      }
    }
  }
  if (unit !== null) {
    m = reMatch(ALT_MEASURE_RE, s, I)
    if (m) {
      a.notes.push(strip(s.slice(0, m.end), ' /'))
      s = s.slice(m.end)
    }
    m = reMatch(PKG_PAREN_RE, s, I)
    if (m) {
      if (U.CONTAINERS.has(unit) && pkg === null) {
        pkg = { qty: cleanNumber(num(g(m, 1) as string)), unit: U.lookup(g(m, 3) as string) }
      } else {
        a.notes.push(strip(s.slice(0, m.end), ' ()'))
      }
      s = s.slice(m.end)
    }
  }
  m = reMatch(raw`^\s*,?\s*or\s+(?:more|less|so)\b\.?\s*,?\s*`, s, I)
  if (m && qty !== null) {
    a.notes.push(strip(g(m, 0) as string, ' ,'))
    s = s.slice(m.end)
    const m2 = reMatch(UNIT_RE, s, I)
    if (unit === null && m2 && U.lookup(g(m2, 1) as string)) {
      unit = U.lookup(g(m2, 1) as string)
      unitWord = g(m2, 1)
      s = s.slice(m2.end)
    }
  }
  m = reMatch(raw`^\s*to taste\b\s*`, s, I)
  if (m && qty !== null) {
    a.notes.push('to taste')
    s = s.slice(m.end)
  }
  if (unit !== null && reMatch(raw`^\s*each\b`, s, I)) {
    // "1/4 tsp each salt and pepper"
    a.each = true
    s = reSub(raw`^\s*each\b\s*`, '', s, I)
  }
  s = reSub(raw`^\s*(?:of|x)\b\s*`, '', s, I)
  s = skipSizeWords(s, a.notes)
  if (unit === null && qty === null) {
    // a unit word with no number: "pinch of salt", "Bunch Parsley"
    m = reMatch(UNIT_RE, s, I)
    if (m) {
      const w = g(m, 1) as string
      const u = U.lookup(w)
      const after = s.slice(m.end)
      const singular =
        !reSearch(raw`(es|s)\.?$`, strip(w), I) || (u === 'pinch' && w.toLowerCase() === 'pinch')
      if (u !== null && U.IMPLICIT_ONE.has(u) && !TC.has(w) && strip(after) && singular) {
        unit = u
        qty = 1
        unitWord = w
        a.qty = 1
        a.unit_implicit_one = true
        s = reSub(raw`^\s*of\b\s*`, '', after, I)
      }
    }
  }
  if (qty === null && unit !== null && unitWord && !a.unit_implicit_one) {
    const singular = !reSearch(raw`(?:es|s)$`, rstrip(strip(unitWord), '.'), I)
    if (U.IMPLICIT_ONE.has(unit) && singular && !TC.has(unitWord)) {
      a.qty = 1
      a.unit_implicit_one = true
    }
  }
  a.unit = unit
  a.unit_word = unitWord
  a.pkg = pkg
  a.rest = strip(s)
  return a
}

// ---------------------------------------------------------------- names

const PREP_SKIP = new Set(['and', 'or', 'then', 'in', 'to', 'the', 'of', 'a', 'about'])

function prepFrom(text: string, matchedKey: string | null): string[] {
  const words = text.toLowerCase().match(/[a-zA-ZÀ-ɏ'-]+/gu) ?? []
  const keyToks = new Set(splitWs(matchedKey ?? ''))
  return words.filter((w) => PREP_WORDS.has(w) && !keyToks.has(w) && !PREP_SKIP.has(w))
}

/** slug + matched key for a name segment, applying 'or' alternatives and small rules. */
function resolveName(name: string): [string | null, string | null, string[]] {
  const notes: string[] = []
  const alts = reSplit(raw`\s+or\s+|\s*/\s*(?=[a-zA-Z])`, name, I)
  let slug: string | null = null
  let key: string | null = null
  if (alts.length > 1) {
    const a1 = strip(alts[0])
    const restAlts = alts.slice(1).map((x) => strip(x))
    notes.push('or ' + restAlts.join(' or '))
    const a2Toks = splitWs(restAlts[0])
    // "chicken or vegetable broth" -> chicken broth; "vegetable or olive oil" -> vegetable oil
    if (splitWs(a1).length <= 2 && a2Toks.length >= 2) {
      for (let k = 1; k < a2Toks.length; k++) {
        const cand = a1 + ' ' + a2Toks.slice(k).join(' ')
        const [s2, k2] = resolve(cand)
        if (s2) {
          const kt = new Set(splitWs(k2 as string))
          if (normTokens(a1).some((t) => kt.has(t))) {
            slug = s2
            key = k2
            break
          }
        }
      }
    }
    if (slug === null) [slug, key] = resolve(a1)
    if (slug === null) [slug, key] = resolve(restAlts[0])
  } else {
    ;[slug, key] = resolve(name)
  }
  return [slug, key, notes]
}

function postRules(slugIn: string | null, name: string, amount: Amount): string | null {
  let slug = slugIn
  const st = state()
  const toks = new Set(normTokens(name))
  const any = (words: string[]) => words.some((w) => toks.has(w))
  if (
    slug === 'coriander' &&
    (any(['fresh', 'leaf', 'leave', 'sprig', 'bunch', 'handful', 'chopped', 'stalk']) ||
      amount.unit === 'bunch' ||
      amount.unit === 'handful' ||
      amount.unit === 'sprig')
  ) {
    slug = 'cilantro'
  }
  const canned =
    amount.unit === 'can' ||
    amount.unit === 'jar' ||
    any(['canned', 'tinned']) ||
    (amount.pkg !== null && amount.unit === 'package')
  if (canned && slug !== null && has(CANNED_FORM, slug)) slug = CANNED_FORM[slug]
  if (slug && [...MEATLESS_WORDS].some((w) => toks.has(w)) && st.explicitMeat.has(slug)) {
    slug = 'vegetarian_meat'
  }
  return slug
}

function makeItem(
  amount: Amount,
  nameIn: string,
  extraNotes: string[],
  allText: string,
  prepExtra: string[] | null = null,
  allowUnitWordName = true,
): ParsedItem {
  let name = strip(nameIn, ' ,;:-.')
  name = reSub(raw`^(?:of|the)\s+`, '', name, I)
  let notes = [...amount.notes, ...extraNotes]
  let unit = amount.unit
  let qty = amount.qty
  if (allowUnitWordName && !name && amount.unit_word && resolve(amount.unit_word)[0]) {
    // "3 whole cloves": the would-be unit is the ingredient
    name = amount.unit_word
    unit = null
    if (amount.unit_implicit_one) qty = null
  }
  // postfix unit: "4 garlic cloves", "2 celery stalks", "6 garlic cloves skin removed"
  const words = splitWs(name)
  if (unit === null) {
    for (let i = 1; i < words.length; i++) {
      const w = strip(words[i].toLowerCase(), '.,')
      if (has(U.POSTFIX, w) && resolve(words.slice(0, i).join(' '))[0]) {
        unit = U.POSTFIX[w]
        break
      }
    }
  }
  for (const t of (prepExtra ?? []).slice(0, 1)) {
    const w = strip(t.toLowerCase(), '. ')
    if (unit === null && has(U.POSTFIX, w)) unit = U.POSTFIX[w]
  }
  const [slug0, key, altNotes] = name ? resolveName(name) : [null, null, [] as string[]]
  notes = notes.concat(altNotes)
  const amount2: Amount = { ...amount, unit }
  const slug = postRules(slug0, name, amount2)
  if (qty !== null && unit === null) unit = 'piece'
  const prep = [...prepFrom(name, key), ...(prepExtra ?? [])]
  const optional =
    reSearch(OPTIONAL_RE, allText, I) !== null ||
    (qty === null && (amount.to_taste || notes.some((n) => reSearch(TASTE_RE, n, I) !== null)))
  return {
    qty: qty !== null ? cleanNumber(qty) : null,
    qty_max: amount.qty_max !== null ? cleanNumber(amount.qty_max) : null,
    unit,
    slug,
    raw_name: name || null,
    prep: [...new Set(prep)].join(', ') || null,
    optional,
    note: notes.filter((n) => n).join('; ') || null,
    pkg: amount.pkg,
  }
}

/** name segment and notes from the text after the amount. */
function splitTail(restIn: string): [string, string[]] {
  const popped = popParens(restIn)
  let rest = popped[0]
  const parenNotes = popped[1]
  if (!strip(rest, ' ,;:.-') && parenNotes.length > 0) {
    // "(ground beef or steak)", "1 (1/4-oz. package active dry yeast)": the name is inside
    const inner = parenNotes.shift() as string
    const a = parseAmount(inner)
    rest = (a.qty !== null || a.unit) && a.rest ? a.rest : inner
  }
  rest = strip(rest, ' ,;:.-')
  const [rest2, clauseNotes] = stripClauses(rest)
  return [strip(rest2, ' ,;:.-'), [...parenNotes, ...clauseNotes]]
}

/** "Juice of 1 lime", "zest of 2 lemons", "lemons, rind of" -> [part, amount text]. */
function fruitPart(rest: string): [string | null, string | null] {
  let m = reMatch(
    raw`^(?:the\s+)?(?:finely\s+|freshly\s+)?(?:grated\s+)?(juice|zest|rind|peel)` +
      raw`(?:\s+and\s+(?:finely\s+)?(?:grated\s+)?(?:juice|zest|rind|peel))?\s+(?:from|of)\s+(.*)$`,
    rest,
    I,
  )
  if (m) return [(g(m, 1) as string).toLowerCase(), g(m, 2)]
  m = reMatch(raw`^(.*?),?\s+(juice|zest|rind|peel)\s+of\b\.?\s*$`, rest, I)
  if (m) return [(g(m, 2) as string).toLowerCase(), g(m, 1)]
  return [null, null]
}

/** One segment (no 'plus' split). */
function parseSimple(text: string, allText: string): ParsedItem[] {
  const [part, fruitText] = fruitPart(text)
  if (part) {
    const amount = parseAmount(fruitText as string)
    const [tailName, notes] = splitTail(amount.rest)
    const name = tailName.split(',')[0]
    const [fslug] = resolve(name)
    let target: string | null = null
    if (fslug) {
      const base = fslug.split('_')[0]
      target = part === 'juice' ? `${base}_juice` : `${base}_zest`
      if (!state().slugs.has(target)) target = fslug
    }
    const item = makeItem(amount, name, notes, allText)
    item.slug = target
    if (item.qty !== null && amount.unit === null) item.unit = 'piece'
    return [item]
  }
  const amount = parseAmount(text)
  const [body, notes] = splitTail(amount.rest)
  const segments = body.split(',').map((seg) => strip(seg))
  const first = segments.length > 0 ? segments[0] : ''
  let tail = segments.slice(1).filter((x) => x)

  // "1 clove 1 clove", "2 tbsp 2 tbsp": a scraped source lost the name and left the amount+unit
  // duplicated. Resolving it (bare "clove" also names the spice) would invent an ingredient.
  if (amount.unit && segments.length === 1 && tail.length === 0) {
    const dup = parseAmount(first)
    if (dup.qty === amount.qty && dup.unit === amount.unit && !strip(splitTail(dup.rest)[0])) {
      return [makeItem(amount, '', notes, allText, null, false)]
    }
  }

  // several ingredients on one line
  const multi = tryMulti(amount.qty === null || amount.each ? body : first, amount, allText, notes)
  if (multi) return multi

  let name = first
  const [slug] = name ? resolve(name) : [null]
  let used = 1
  if (slug === null && tail.length > 0) {
    // "2 large boneless, skinless chicken breasts": the name runs past the first comma
    for (let j = 1; j < Math.min(segments.length, 4); j++) {
      const cand = segments.slice(0, j + 1).join(' ')
      const [s2] = resolve(cand)
      if (s2) {
        name = cand
        used = j + 1
        break
      }
    }
  }
  tail = segments.slice(used).filter((x) => x)
  const prepExtra: string[] = []
  const tailNotes: string[] = []
  for (const t of tail) {
    const ws = splitWs(t)
    const w = ws.length > 0 ? ws[0].toLowerCase() : ''
    if (PREP_WORDS.has(w) || w.endsWith('ed') || w.endsWith('ly') || has(U.POSTFIX, w)) {
      prepExtra.push(t)
    } else {
      tailNotes.push(t)
    }
  }
  return [makeItem(amount, name, [...notes, ...tailNotes], allText, prepExtra)]
}

function tryMulti(
  bodyIn: string,
  amount: Amount,
  allText: string,
  notes: string[],
): ParsedItem[] | null {
  const body = reSub(raw`\s*&\s*`, ' and ', bodyIn)
  if (!body.toLowerCase().includes(' and ') && !body.includes(',')) return null
  const index = state().index
  const [whole] = resolve(body)
  if (whole && index.has(normTokens(body).join(' '))) return null
  const parts = reSplit(raw`,|\band\b|\bplus\b`, body, I)
    .map((p) => strip(p))
    .filter((p) => p)
  if (parts.length < 2) return null
  const resolved: [string, Amount | null][] = []
  for (let pi = 0; pi < parts.length; pi++) {
    const p = parts[pi]
    const a2 = reMatch(raw`^\d`, p) ? parseAmount(p) : null
    let pname = a2 ? a2.rest : p
    pname = splitTail(pname)[0]
    const [s] = resolve(pname)
    if (!s) return null
    if (pi > 0 && STOP_SECOND_PART.has(normTokens(pname).join(' '))) return null
    resolved.push([p, a2])
  }
  if (amount.qty !== null && !amount.each) {
    // with an amount, only a clean "X and Y" of two full names splits ("1 Salt and pepper")
    for (const [p] of resolved) {
      if (!index.has(normTokens(splitTail(p)[0]).join(' '))) return null
    }
  }
  const items: ParsedItem[] = []
  resolved.forEach(([p, a2], n) => {
    if (a2) {
      items.push(makeItem(a2, splitTail(a2.rest)[0], notes, allText))
    } else {
      const am: Amount =
        amount.each || n === 0
          ? amount
          : { ...amount, qty: null, qty_max: null, unit: null, pkg: null, notes: [...amount.notes] }
      items.push(makeItem(am, p, notes, allText))
    }
  })
  return items
}

/** Parse one raw ingredient line into a list of items (see the module docstring). */
export function parseLine(line: string | null | undefined): ParsedItem[] {
  if (line === null || line === undefined) return []
  const text = preclean(line)
  if (!text || !reSearch(raw`[\w一-鿿]`, text)) return []
  if (isHeader(text)) return []
  // "1 cup plus 2 tablespoons X" / "1 egg plus 2 egg whites"
  const m = reSearch(
    raw`\s+(?:plus|mixed with|combined with|whisked with|dissolved in|blended with)\s+(?=\d)`,
    text,
    I,
  )
  if (m) {
    const seg1 = text.slice(0, m.start)
    const seg2 = text.slice(m.end)
    const a1 = parseAmount(seg1)
    const [name1] = splitTail(a1.rest)
    const a2 = parseAmount(seg2)
    if (!name1 && a1.unit && a2.unit && a1.qty !== null && a2.qty !== null) {
      const add = U.convert(a2.qty, a2.unit, a1.unit)
      if (add !== null) {
        const merged: Amount = {
          ...a2,
          qty: a1.qty + add,
          unit: a1.unit,
          qty_max: null,
          notes: [
            ...a1.notes,
            `${strip(seg1)} plus ${pyNumStr(cleanNumber(a2.qty) as number)} ${a2.unit}`,
          ],
        }
        const [body, notes] = splitTail(merged.rest)
        const segs = body.split(',')
        return [
          makeItem(
            merged,
            segs[0],
            [
              ...notes,
              ...segs
                .slice(1)
                .map((x) => strip(x))
                .filter((x) => x),
            ],
            text,
          ),
        ]
      }
    }
    const [name2] = splitTail(a2.rest)
    const [s2] = name2 ? resolve(name2) : [null]
    if (name1 && s2) return [...parseSimple(seg1, text), ...parseSimple(seg2, text)]
    if (!name1 && name2) {
      // "1 c. plus 1 pinch sugar", "1 stick plus 2 Tbsp. melted margarine": the name is after
      // the second amount and the units do not add up
      const [body, notes] = splitTail(a2.rest)
      const segs = body.split(',')
      return [
        makeItem(
          a1,
          segs[0],
          [
            ...notes,
            'plus ' + strip(seg2),
            ...segs
              .slice(1)
              .map((x) => strip(x))
              .filter((x) => x),
          ],
          text,
        ),
      ]
    }
    const items = parseSimple(seg1, text)
    if (items.length > 0) {
      items[0].note = [items[0].note, 'plus ' + seg2].filter((x) => x).join('; ')
    }
    return items
  }
  return parseSimple(text, text)
}
