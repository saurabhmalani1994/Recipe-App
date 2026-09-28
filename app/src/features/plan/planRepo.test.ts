import { beforeEach, describe, expect, it } from 'vitest'
import { resetUserDbForTests } from '../../db'
import {
  addPlanEntry,
  listPlanEntries,
  mondayOf,
  movePlanEntry,
  nextWeekStart,
  previousWeekStart,
  removePlanEntry,
  setPlanEntryPeople,
  weekDays,
} from './planRepo'

beforeEach(() => {
  window.localStorage.clear()
  resetUserDbForTests()
})

describe('week math', () => {
  it('mondayOf finds the Monday of the week a date falls in', () => {
    expect(mondayOf(new Date(2026, 8, 30))).toBe('2026-09-28') // a Wednesday
    expect(mondayOf(new Date(2026, 8, 28))).toBe('2026-09-28') // already Monday
    expect(mondayOf(new Date(2026, 9, 4))).toBe('2026-09-28') // a Sunday, same week
  })

  it('weekDays lists the 7 ISO dates from a Monday', () => {
    expect(weekDays('2026-09-28')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
  })

  it('next/previous week step by 7 days, crossing a month', () => {
    expect(nextWeekStart('2026-09-28')).toBe('2026-10-05')
    expect(previousWeekStart('2026-10-05')).toBe('2026-09-28')
  })
})

describe('plan entries', () => {
  it('adds, moves, rescales people, lists and removes an entry', async () => {
    const weekStart = '2026-09-28'
    const id = await addPlanEntry({
      weekStart,
      day: '2026-09-28',
      meal: 'dinner',
      recipeId: 'nyt:123',
      recipeSource: 'corpus',
      recipeTitle: 'Weeknight Chana Masala',
      people: 2,
    })

    let entries = await listPlanEntries(weekStart)
    expect(entries).toEqual([
      {
        id,
        day: '2026-09-28',
        meal: 'dinner',
        recipeId: 'nyt:123',
        recipeSource: 'corpus',
        recipeTitle: 'Weeknight Chana Masala',
        people: 2,
      },
    ])

    await movePlanEntry(id, '2026-09-29', 'lunch')
    await setPlanEntryPeople(id, 4)
    entries = await listPlanEntries(weekStart)
    expect(entries[0]).toMatchObject({ day: '2026-09-29', meal: 'lunch', people: 4 })

    await removePlanEntry(id)
    expect(await listPlanEntries(weekStart)).toEqual([])
  })

  it('keeps this week and next week separate', async () => {
    await addPlanEntry({
      weekStart: '2026-09-28',
      day: '2026-09-28',
      meal: 'dinner',
      recipeId: 'a',
      recipeSource: 'fixture',
      recipeTitle: 'A',
      people: 2,
    })
    await addPlanEntry({
      weekStart: '2026-10-05',
      day: '2026-10-06',
      meal: 'lunch',
      recipeId: 'b',
      recipeSource: 'fixture',
      recipeTitle: 'B',
      people: 2,
    })

    expect((await listPlanEntries('2026-09-28')).map((e) => e.recipeTitle)).toEqual(['A'])
    expect((await listPlanEntries('2026-10-05')).map((e) => e.recipeTitle)).toEqual(['B'])
  })
})
