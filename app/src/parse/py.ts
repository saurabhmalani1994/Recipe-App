/**
 * The bits of Python's `re` and `str` the parser port leans on, with Python's semantics.
 *
 * The parser (`ingest/parse/parser.py`) is written against Python 3 `str` regexes, where `\w`,
 * `\s`, `\d` and `\b` are Unicode-aware; in JavaScript they are ASCII-only, even with the `u`
 * flag. `pyRe` translates a pattern written in Python syntax so the port can keep the reference
 * patterns verbatim, which is what keeps it at parity (see `parity.test.ts`).
 */

/** Python's `str.isspace()` set, which is also what its Unicode `\s` matches. */
const WS_CHARS =
  '\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const WORD_CHARS = '\\p{L}\\p{N}_'
const WORD = `[${WORD_CHARS}]`
const BOUNDARY = `(?:(?<=${WORD})(?!${WORD})|(?<!${WORD})(?=${WORD}))`
const WS_SET = new Set(
  [
    '\t',
    '\n',
    '\v',
    '\f',
    '\r',
    ' ',
    '\x1c',
    '\x1d',
    '\x1e',
    '\x1f',
    '\x85',
    '\xa0',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    '　',
  ].concat(Array.from({ length: 11 }, (_, i) => String.fromCharCode(0x2000 + i))),
)

const CACHE = new Map<string, RegExp>()

/**
 * Compile a pattern written in Python `re` syntax. `flags` takes JavaScript letters (`i`, `g`);
 * `u` is always added. Handled: `\w \W \s \S \d \D \b \B` (Unicode, as in Python), and the
 * escapes Python allows but JavaScript's `u` mode rejects (`\'`, `\"`, `\ `, `\-`, ...).
 */
export function pyRe(pattern: string, flags = ''): RegExp {
  const key = `${flags}/${pattern}`
  const hit = CACHE.get(key)
  if (hit) {
    hit.lastIndex = 0
    return hit
  }
  let out = ''
  let inClass = false
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\' && i + 1 < pattern.length) {
      const c = pattern[++i]
      switch (c) {
        case 'w':
          out += inClass ? WORD_CHARS : WORD
          break
        case 'W':
          if (inClass) throw new Error(`pyRe: \\W inside a class is not supported: ${pattern}`)
          out += `[^${WORD_CHARS}]`
          break
        case 's':
          out += inClass ? WS_CHARS : `[${WS_CHARS}]`
          break
        case 'S':
          if (inClass) throw new Error(`pyRe: \\S inside a class is not supported: ${pattern}`)
          out += `[^${WS_CHARS}]`
          break
        case 'd':
          out += '\\p{Nd}'
          break
        case 'D':
          out += '\\P{Nd}'
          break
        case 'b':
          if (inClass) throw new Error(`pyRe: \\b inside a class is not supported: ${pattern}`)
          out += BOUNDARY
          break
        case 'B':
          out += `(?:(?<=${WORD})(?=${WORD})|(?<!${WORD})(?!${WORD}))`
          break
        default:
          if (/[.*+?^${}()|[\]\\/]/.test(c) || (inClass && c === '-')) out += '\\' + c
          else if (/[A-Za-z0-9]/.test(c)) out += '\\' + c
          else out += c
      }
      continue
    }
    if (inClass) {
      if (ch === ']') inClass = false
      out += ch
      continue
    }
    if (ch === '[') {
      inClass = true
      out += ch
      // A ']' right after '[' or '[^' is a literal in Python.
      if (pattern[i + 1] === '^') {
        out += '^'
        i++
      }
      if (pattern[i + 1] === ']') {
        out += '\\]'
        i++
      }
      continue
    }
    out += ch
  }
  const re = new RegExp(out, flags + 'u')
  CACHE.set(key, re)
  return re
}

/** `re.escape` for a literal inside a pattern given to `pyRe` (spaces stay literal spaces). */
export function reEscape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/-]/g, (c) => (c === '-' ? '-' : '\\' + c))
}

export interface PyMatch {
  /** groups[0] is the whole match; a group that did not take part is null (Python None). */
  groups: (string | null)[]
  start: number
  end: number
}

function toMatch(m: RegExpExecArray | null): PyMatch | null {
  if (!m) return null
  return {
    groups: Array.from(m, (g) => (g === undefined ? null : g)),
    start: m.index,
    end: m.index + m[0].length,
  }
}

/** `re.match`: anchored at the start of `s`. */
export function reMatch(pattern: string, s: string, flags = ''): PyMatch | null {
  return toMatch(pyRe(`^(?:${pattern})`, flags).exec(s))
}

/** `re.fullmatch`. */
export function reFullmatch(pattern: string, s: string, flags = ''): PyMatch | null {
  return toMatch(pyRe(`^(?:${pattern})$`, flags).exec(s))
}

/** `re.search`. */
export function reSearch(pattern: string, s: string, flags = ''): PyMatch | null {
  return toMatch(pyRe(pattern, flags).exec(s))
}

/** `re.sub` (every occurrence) with a string replacement taken literally. */
export function reSub(pattern: string, repl: string, s: string, flags = ''): string {
  return s.replace(pyRe(pattern, flags + 'g'), () => repl)
}

/** `re.split` for a pattern with no capture groups. */
export function reSplit(pattern: string, s: string, flags = ''): string[] {
  return s.split(pyRe(pattern, flags))
}

export function isSpace(ch: string): boolean {
  return WS_SET.has(ch)
}

/** `str.strip([chars])`, `lstrip`, `rstrip`. */
export function strip(s: string, chars?: string): string {
  return rstrip(lstrip(s, chars), chars)
}

export function lstrip(s: string, chars?: string): string {
  const has = chars === undefined ? isSpace : (c: string) => chars.includes(c)
  let i = 0
  while (i < s.length && has(s[i])) i++
  return s.slice(i)
}

export function rstrip(s: string, chars?: string): string {
  const has = chars === undefined ? isSpace : (c: string) => chars.includes(c)
  let j = s.length
  while (j > 0 && has(s[j - 1])) j--
  return s.slice(0, j)
}

/** `str.split()` with no separator: runs of whitespace, no empty strings. */
export function splitWs(s: string): string[] {
  const out: string[] = []
  let cur = ''
  for (const ch of s) {
    if (isSpace(ch)) {
      if (cur) out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

/** `len(s)` in code points. */
export function pyLen(s: string): number {
  let n = 0
  for (const ch of s) {
    void ch
    n++
  }
  return n
}

/** `str.isalpha()`. */
export function isAlpha(s: string): boolean {
  return s.length > 0 && /^\p{L}+$/u.test(s)
}

// Zero code points of the Unicode decimal-digit blocks (Nd), so `int()` of a non-ASCII digit
// ("３", "٣") reads as it does in Python.
const DIGIT_ZEROS = [
  0x30, 0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xde6,
  0xe50, 0xed0, 0xf20, 0x1040, 0x1090, 0x17e0, 0x1810, 0x1946, 0x19d0, 0x1a80, 0x1a90, 0x1b50,
  0x1bb0, 0x1c40, 0x1c50, 0xa620, 0xa8d0, 0xa900, 0xa9d0, 0xa9f0, 0xaa50, 0xabf0, 0xff10,
]

function asciiDigits(s: string): string {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number
    if (cp >= 0x30 && cp <= 0x39) {
      out += ch
      continue
    }
    if (/\p{Nd}/u.test(ch)) {
      const zero = DIGIT_ZEROS.find((z) => cp >= z && cp <= z + 9)
      if (zero !== undefined) out += String(cp - zero)
      else if (cp >= 0x1d7ce && cp <= 0x1d7ff) out += String((cp - 0x1d7ce) % 10)
      else out += String(cp % 16) // other blocks start at ...0 or ...6; rare enough
      continue
    }
    out += ch
  }
  return out
}

/** `int(s)` for a run of decimal digits. */
export function pyInt(s: string): number {
  return Number(asciiDigits(s))
}

/** `float(s)` for the digit/dot tokens the parser feeds it; null where Python raises. */
export function pyFloat(s: string): number | null {
  const t = strip(asciiDigits(s))
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(t)) return null
  return Number(t)
}

/** Python's `round(x, 4)`: correctly rounded, ties to even. */
export function round4(x: number): number {
  if (!Number.isFinite(x)) return x
  const neg = x < 0
  const a = Math.abs(x)
  // toFixed(30) is exact for any tie: a double whose decimal expansion stops at the 5th place.
  const exact = a.toFixed(30)
  const dot = exact.indexOf('.')
  const tail = exact.slice(dot + 5)
  let r: number
  if (tail[0] === '5' && /^0*$/.test(tail.slice(1))) {
    const truncated = exact.slice(0, dot + 5)
    const lastDigit = Number(truncated[truncated.length - 1])
    const down = Number(truncated)
    r = lastDigit % 2 === 0 ? down : Number((down + 0.0001).toFixed(4))
  } else {
    r = Number(a.toFixed(4))
  }
  return neg ? -r : r
}

/** `str(n)` for the int-or-float the parser prints into a note. */
export function pyNumStr(n: number): string {
  if (Number.isInteger(n)) return Math.abs(n) >= 1e21 ? BigInt(n).toString() : String(n)
  const s = String(n)
  // Python writes 1e-05 / 1e+16 where JavaScript writes 0.00001 / 10000000000000000.
  if (Math.abs(n) >= 1e16 || (Math.abs(n) < 1e-4 && n !== 0)) {
    const [mant, exp] = n.toExponential().split('e')
    const e = Number(exp)
    return `${mant}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`
  }
  return s
}
