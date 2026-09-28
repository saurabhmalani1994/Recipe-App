/**
 * Port of `ingest/taxonomy/normalize.py`: the name normalisation shared by the synonym index and
 * the parser. Both sides of a lookup go through `normName`, so a quirk of the singulariser
 * (molasses -> molass) is harmless. The word tables come verbatim from Python
 * (`tables.gen.json`, written by `scripts/gen_parse_snapshot.py`).
 */
import tables from './tables.gen.json'
import { isAlpha, pyLen, pyRe, reSub, splitWs, strip } from './py'

const KEEP: ReadonlySet<string> = new Set(tables.normalize.KEEP)
const IRREGULAR: Record<string, string> = tables.normalize.IRREGULAR
const SPELLING: Record<string, string> = tables.normalize.SPELLING

const CJK = '぀-ヿ㐀-䶿一-鿿가-힯'

function get(map: Record<string, string>, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined
}

export function stripAccents(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .normalize('NFC')
}

export function singular(word: string): string {
  const irr = get(IRREGULAR, word)
  if (irr !== undefined) return irr
  if (KEEP.has(word) || pyLen(word) <= 3 || !isAlpha(word)) return word
  const ends = (...suffixes: string[]) => suffixes.some((s) => word.endsWith(s))
  if (ends('ss', 'us', 'is', 'ys', 'os') && !word.endsWith('oes')) {
    if (word.endsWith('os')) return word.slice(0, -1)
    return word
  }
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.endsWith('oes')) return word.slice(0, -2)
  if (ends('ches', 'shes', 'xes', 'sses', 'zzes')) return word.slice(0, -2)
  if (word.endsWith('s')) return word.slice(0, -1)
  return word
}

export function hasCjk(text: string): boolean {
  return pyRe(`[${CJK}]`).test(text)
}

/** Lowercase, strip accents, turn punctuation into spaces. Apostrophes are dropped. */
export function cleanText(text: string): string {
  let t = stripAccents(text).toLowerCase()
  t = t.replaceAll('’', '').replaceAll("'", '').replaceAll('`', '').replaceAll('‘', '')
  t = t.replaceAll('&', ' and ')
  t = reSub(String.raw`[^\w\s${CJK}]`, ' ', t)
  t = t.replaceAll('_', ' ')
  return strip(reSub(String.raw`\s+`, ' ', t))
}

export function normTokens(text: string): string[] {
  const out: string[] = []
  for (let w of splitWs(cleanText(text))) {
    w = get(SPELLING, w) ?? w
    for (const x of splitWs(w)) {
      const s = singular(x)
      out.push(get(SPELLING, s) ?? s)
    }
  }
  return out
}

/** The lookup key for a name: cleaned, every word singular, joined by one space. */
export function normName(text: string): string {
  return normTokens(text).join(' ')
}
