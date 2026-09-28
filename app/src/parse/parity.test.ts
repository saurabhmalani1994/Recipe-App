import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseLine, type ParsedItem } from './parser'

/**
 * S13 #2 (rule 12): the TypeScript parser gives the Python parser's output, line for line.
 *
 * Inputs are read from `ingest/` itself (the gold set and the 3000-line sample), and compared
 * with `testdata/python_parse.json`, the Python output written by
 * `scripts/gen_parse_snapshot.py`. The snapshot carries each input line too, so a snapshot
 * that has gone stale against `ingest/` fails here rather than comparing the wrong lines.
 *
 * Bar (brief S13): 100% equal on gold, >= 99.5% on the sample, and every sample difference is
 * listed in KNOWN_DIFFERENCES with the reason. A difference not listed there fails the test,
 * and so does a listed one that has stopped differing.
 */

interface SnapshotRow {
  line: string
  items: ParsedItem[]
}

const ROOT = `${process.cwd()}/..`
const snapshot = JSON.parse(
  readFileSync(`${process.cwd()}/src/parse/testdata/python_parse.json`, 'utf-8'),
) as { gold: SnapshotRow[]; sample: SnapshotRow[]; edge: SnapshotRow[] }

function goldLines(): string[] {
  return readFileSync(`${ROOT}/ingest/parse/gold.jsonl`, 'utf-8')
    .split('\n')
    .filter((row) => row.trim())
    .map((row) => (JSON.parse(row) as { line: string }).line)
}

function sampleLines(path = `${ROOT}/ingest/fixtures/ingredient_lines_sample.txt`): string[] {
  const lines = readFileSync(path, 'utf-8').split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Sample lines whose TS output is known to differ from Python's, with why. Empty: none do. */
const KNOWN_DIFFERENCES: Record<string, string> = {}

function differences(rows: SnapshotRow[]): { line: string; py: ParsedItem[]; ts: ParsedItem[] }[] {
  const out = []
  for (const row of rows) {
    const ts = parseLine(row.line)
    // toEqual semantics: 1 and 1.0 are the same number once parsed from JSON.
    if (JSON.stringify(ts) !== JSON.stringify(normalise(row.items))) {
      out.push({ line: row.line, py: row.items, ts })
    }
  }
  return out
}

/** The snapshot's keys are sorted; put them in the parser's field order to compare as text. */
function normalise(items: ParsedItem[]): ParsedItem[] {
  return items.map((it) => ({
    qty: it.qty,
    qty_max: it.qty_max,
    unit: it.unit,
    slug: it.slug,
    raw_name: it.raw_name,
    prep: it.prep,
    optional: it.optional,
    note: it.note,
    pkg: it.pkg === null ? null : { qty: it.pkg.qty, unit: it.pkg.unit },
  }))
}

describe('parser parity with ingest/parse/parser.py', () => {
  it('the snapshot covers exactly the lines in ingest/ (regenerate it if this fails)', () => {
    expect(snapshot.gold.map((r) => r.line)).toEqual(goldLines())
    expect(snapshot.sample.map((r) => r.line)).toEqual(sampleLines())
    expect(snapshot.edge.map((r) => r.line)).toEqual(
      sampleLines(`${process.cwd()}/src/parse/testdata/edge_lines.txt`),
    )
  })

  it('edge lines (round() ties, Unicode digits and boundaries, CJK, huge numbers): 100% equal', () => {
    expect(differences(snapshot.edge)).toEqual([])
  })

  it('gold set: 100% equal', () => {
    const diffs = differences(snapshot.gold)
    expect(diffs).toEqual([])
    expect(snapshot.gold.length).toBe(372)
  })

  it('3000-line sample: >= 99.5% equal, every difference listed and explained', () => {
    const diffs = differences(snapshot.sample)
    const unexplained = diffs.filter((d) => !(d.line in KNOWN_DIFFERENCES))
    expect(unexplained).toEqual([])
    const stale = Object.keys(KNOWN_DIFFERENCES).filter((l) => !diffs.some((d) => d.line === l))
    expect(stale).toEqual([])
    const equal = snapshot.sample.length - diffs.length
    expect(equal / snapshot.sample.length).toBeGreaterThanOrEqual(0.995)
    console.log(
      `parser parity: gold ${snapshot.gold.length}/${snapshot.gold.length}, sample ${equal}/${snapshot.sample.length} equal`,
    )
  })
})
