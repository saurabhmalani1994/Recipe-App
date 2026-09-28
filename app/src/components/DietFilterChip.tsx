import { useState } from 'react'
import { DIET_PRESETS, DIET_PRESET_LABELS, useDiet, type DietPreset } from '../state/diet'
import { BottomSheet, OptionList } from './ui/BottomSheet'
import { FilterChip } from './ui/Chip'

const HINTS: Record<DietPreset, string> = {
  everything: 'No diet filter',
  vegetarian: 'No meat or fish; recipes that adapt show the swap',
  no_red_meat: 'Fish and poultry are fine; no beef, pork or lamb',
}

/**
 * S22a (owner, D21: the diet switch as a "Filter chip in Cook & Home", with the default in
 * Settings). Reads "Diet" at rest; with a diet on, it fills and names it ("Vegetarian"). Tapping
 * opens a small sheet with the three presets; picking one applies it and closes the sheet.
 */
export function DietFilterChip() {
  const { preset, setPreset, defaultPreset } = useDiet()
  const [open, setOpen] = useState(false)
  const active = preset !== 'everything'
  const options = DIET_PRESETS.map((value) => ({
    value,
    label: DIET_PRESET_LABELS[value],
    hint: value === defaultPreset ? `${HINTS[value]} · your default` : HINTS[value],
  }))

  return (
    <>
      <FilterChip
        label={active ? DIET_PRESET_LABELS[preset] : 'Diet'}
        ariaLabel={`Diet: ${DIET_PRESET_LABELS[preset]}`}
        icon="leaf"
        active={active}
        opensSheet
        testId="diet-chip"
        onClick={() => setOpen(true)}
      />
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Diet" testId="diet-sheet">
        <OptionList
          label="Diet"
          options={options}
          value={preset}
          onChange={(value) => {
            setPreset(value)
            setOpen(false)
          }}
        />
      </BottomSheet>
    </>
  )
}
