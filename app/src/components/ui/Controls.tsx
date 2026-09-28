import type { ReactNode } from 'react'
import { Icon } from './Icon'

interface SegmentedProps<T extends string> {
  /** The group's accessible name ("Week", "Units"). */
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  testId?: string
  className?: string
}

/** A segmented control (S22b): "This week / Next week", "Metric / US". One radio per segment. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  testId,
  className = '',
}: SegmentedProps<T>) {
  return (
    <div
      className={`segmented ${className}`}
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
      data-swipe-ignore=""
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            className={`segmented__option${checked ? ' segmented__option--checked' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

interface StepperProps {
  /** What is counted, for the buttons' names ("people" gives "Fewer people"). */
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  /** The visible value ("3 people"); the number itself by default. */
  children?: ReactNode
  testId?: string
}

/** A − value + stepper with 48dp buttons (servings, people). */
export function Stepper({
  label,
  value,
  min = 1,
  max = 99,
  step = 1,
  onChange,
  children,
  testId,
}: StepperProps) {
  const round = (n: number) => Math.round(n * 100) / 100
  return (
    <div className="stepper" role="group" aria-label={label} data-testid={testId}>
      <button
        type="button"
        className="stepper__button"
        aria-label={`Fewer ${label}`}
        disabled={value - step < min}
        onClick={() => onChange(round(Math.max(min, value - step)))}
      >
        <Icon name="minus" size={20} />
      </button>
      <output className="stepper__value" aria-live="polite">
        {children ?? value}
      </output>
      <button
        type="button"
        className="stepper__button"
        aria-label={`More ${label}`}
        disabled={value + step > max}
        onClick={() => onChange(round(Math.min(max, value + step)))}
      >
        <Icon name="plus" size={20} />
      </button>
    </div>
  )
}

interface SwitchRowProps {
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  testId?: string
}

/** A settings row with a switch at the end. The whole row is the (real, native) control. */
export function SwitchRow({ label, hint, checked, onChange, testId }: SwitchRowProps) {
  return (
    <label className="list-row switch-row" data-testid={testId}>
      <span className="list-row__text">
        <span className="list-row__label">{label}</span>
        {hint && <span className="list-row__hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch-row__input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  )
}

interface CheckChipProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/** A chip that toggles (equipment in the editor): a real checkbox under a chip's look. */
export function CheckChip({ label, checked, onChange }: CheckChipProps) {
  return (
    <label className={`check-chip${checked ? ' check-chip--checked' : ''}`}>
      <input
        type="checkbox"
        className="check-chip__input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {checked && <Icon name="check" size={16} />}
      <span>{label}</span>
    </label>
  )
}
