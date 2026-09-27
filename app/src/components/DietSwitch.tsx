import { DIET_PRESETS, DIET_PRESET_LABELS, useDiet } from '../state/diet'

export function DietSwitch() {
  const { preset, setPreset } = useDiet()

  return (
    <div className="diet-switch" role="radiogroup" aria-label="Diet quick switch">
      {DIET_PRESETS.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preset === value}
          className={`diet-switch__option${preset === value ? ' diet-switch__option--active' : ''}`}
          onClick={() => setPreset(value)}
        >
          {DIET_PRESET_LABELS[value]}
        </button>
      ))}
    </div>
  )
}
