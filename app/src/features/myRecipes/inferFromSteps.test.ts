import { describe, expect, it } from 'vitest'
import { inferEquipment, inferTotalMinutes } from './inferFromSteps'

// S12b brief #3 (R13): a small TS port of "keyword equipment and summed 'N minutes'" from
// ingest/tag/equipment.py and timing.py, used to suggest values the editor's owner can accept.
describe('inferFromSteps', () => {
  describe('inferEquipment', () => {
    it('finds equipment named in the steps', () => {
      const equipment = inferEquipment([
        'Heat the oil in a large skillet over medium heat.',
        'Transfer to the oven and bake at 180C for 20 minutes.',
      ])
      expect(equipment).toEqual(['oven', 'stovetop'])
    })

    it('tells a toaster oven apart from a toaster', () => {
      expect(inferEquipment(['Toast in the toaster oven for 5 minutes.'])).toEqual([
        'toaster_oven',
      ])
      expect(inferEquipment(['Toast the bread in the toaster.'])).toEqual(['toaster'])
    })

    it('returns nothing for steps that name no kit', () => {
      expect(inferEquipment(['Mix the flour and sugar in a bowl.'])).toEqual([])
    })
  })

  describe('inferTotalMinutes', () => {
    it('sums every duration named across the steps', () => {
      expect(
        inferTotalMinutes([
          'Fry the onion for 5 minutes.',
          'Simmer for 20 minutes, then rest for 10 minutes.',
        ]),
      ).toBe(35)
    })

    it('converts hours to minutes and takes the upper end of a range', () => {
      expect(inferTotalMinutes(['Bake for 1 hour.', 'Chill for 10-15 minutes.'])).toBe(75)
    })

    it('reads "overnight" as 8 hours', () => {
      expect(inferTotalMinutes(['Leave to marinate overnight.'])).toBe(480)
    })

    it('returns null when no step names a duration', () => {
      expect(inferTotalMinutes(['Mix everything together.', 'Serve immediately.'])).toBeNull()
    })

    it('ignores a storage note, not a cook time', () => {
      expect(inferTotalMinutes(['Keeps for up to 3 months in the freezer.'])).toBeNull()
    })
  })
})
