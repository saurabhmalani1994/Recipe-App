import { useState, type ReactNode } from 'react'
import type { Cuisine } from '../../corpus/types'
import type { Nutrition } from '../../features/cook/corpusRecipe'
import { Segmented, Stepper } from '../ui/Controls'
import { Icon } from '../ui/Icon'
import { RecipeImage } from '../ui/RecipeCard'
import { useWakeLock } from '../ui/useWakeLock'

export interface DetailIngredient {
  key: string | number
  /** The line as shown ("125 g rice noodles"). */
  text: ReactNode
  missing?: boolean
  /** "you avoid this" (S16): 'hide' or 'lower'. */
  avoided?: 'hide' | 'lower'
  /** Swap lines under the ingredient (diet swap, the best substitution). */
  notes?: ReactNode[]
}

export interface ServingsControl {
  people: number
  onPeopleChange: (people: number) => void
  /** The servings the quantities are scaled to, or null when the recipe cannot be scaled. */
  target: number | null
}

interface RecipeDetailViewProps {
  title: string
  imageUrl?: string | null
  cuisine: Cuisine | null
  /** The cuisine shown above the title (null: none, or a classifier guess under 0.8). */
  cuisineLabel?: string | null
  /** The meta row under the title: time, serves, the diet badge. */
  meta: ReactNode
  /** Star, Add to plan, Make my version / Edit. */
  actions: ReactNode
  /** The sticky servings stepper; omitted for a recipe that is not scaled. */
  servings?: ServingsControl
  /** The Metric / US toggle; omitted where quantities are not converted. */
  units?: { value: 'metric' | 'us'; onChange: (units: 'metric' | 'us') => void }
  /** Anything between the head and the ingredients (equipment chips, notes). */
  intro?: ReactNode
  ingredients: DetailIngredient[]
  steps: string[]
  videoUrl?: string | null
  nutrition?: Nutrition | null
  sourceUrl?: string | null
  footer?: ReactNode
}

function formatGrams(value: number | null): string | null {
  if (value === null) return null
  return value >= 10 ? `${Math.round(value)} g` : `${Math.round(value * 10) / 10} g`
}

function NutritionCard({ nutrition }: { nutrition: Nutrition }) {
  const rows: [string, string | null][] = [
    ['Protein', formatGrams(nutrition.proteinG)],
    ['Carbs', formatGrams(nutrition.carbsG)],
    ['Fat', formatGrams(nutrition.fatG)],
    ['Fibre', formatGrams(nutrition.fiberG)],
    ['Sugar', formatGrams(nutrition.sugarG)],
    ['Sodium', nutrition.sodiumMg === null ? null : `${Math.round(nutrition.sodiumMg)} mg`],
  ]
  const shown = rows.filter((r): r is [string, string] => r[1] !== null)
  return (
    <section className="nutrition-card" aria-labelledby="nutrition-title" data-testid="nutrition">
      <div className="nutrition-card__head">
        <h3 className="nutrition-card__title" id="nutrition-title">
          Nutrition per serving
        </h3>
        <span className="estimate-badge">estimate</span>
      </div>
      <p className="nutrition-card__kcal">
        <span className="nutrition-card__kcal-value">{Math.round(nutrition.kcal)}</span> kcal
      </p>
      {shown.length > 0 && (
        <dl className="nutrition-card__grid">
          {shown.map(([label, value]) => (
            <div key={label} className="nutrition-card__cell">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="nutrition-card__note">
        Worked out from the ingredients with USDA data, so treat it as a guide.
      </p>
    </section>
  )
}

/**
 * The recipe detail layout shared by corpus, fixture and My Recipe views (S22b): a full-bleed
 * hero photo (or placeholder), the title in the serif with a meta row, the actions, a sticky
 * servings stepper with the Metric/US toggle, the ingredients as a checklist, the steps as
 * numbered cards (or a prominent "Method in the video" button), a nutrition card labelled
 * "estimate", and the source. Body text is 17px or more, and the screen stays awake while a
 * recipe is open (a Wake Lock; a refusal is tolerated).
 */
export function RecipeDetailView({
  title,
  imageUrl,
  cuisine,
  cuisineLabel,
  meta,
  actions,
  servings,
  units,
  intro,
  ingredients,
  steps,
  videoUrl,
  nutrition,
  sourceUrl,
  footer,
}: RecipeDetailViewProps) {
  useWakeLock()
  const [done, setDone] = useState<ReadonlySet<string | number>>(new Set())

  function toggle(key: string | number) {
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <article className="detail">
      <div className="detail-hero">
        <RecipeImage
          src={imageUrl}
          title={title}
          cuisine={cuisine}
          className="detail-hero__image"
          eager
        />
      </div>

      <header className="detail-head">
        {cuisineLabel && <p className="kicker">{cuisineLabel}</p>}
        <h2 className="detail-head__title">{title}</h2>
        <div className="detail-head__meta meta" data-testid="recipe-facts">
          {meta}
        </div>
        <div className="detail-head__actions">{actions}</div>
      </header>

      {(servings || units) && (
        <div className="detail-controls" data-testid="detail-controls">
          {servings && servings.target !== null && (
            <div className="detail-controls__servings">
              <Stepper
                label="people"
                value={servings.people}
                onChange={servings.onPeopleChange}
                testId="servings-stepper"
              >
                <span className="stepper__main">
                  {servings.people} {servings.people === 1 ? 'person' : 'people'}
                </span>
                <span className="stepper__sub">
                  {servings.target} {servings.target === 1 ? 'serving' : 'servings'}
                </span>
              </Stepper>
            </div>
          )}
          {units && (
            <Segmented
              label="Units"
              value={units.value}
              onChange={units.onChange}
              className="detail-controls__units"
              options={[
                { value: 'metric', label: 'Metric' },
                { value: 'us', label: 'US' },
              ]}
            />
          )}
        </div>
      )}

      {intro}

      <section className="detail-section" aria-labelledby="ingredients-title">
        <div className="detail-section__head">
          <h3 className="detail-section__title" id="ingredients-title">
            Ingredients
          </h3>
          {done.size > 0 && (
            <button type="button" className="button button--text" onClick={() => setDone(new Set())}>
              Clear ticks
            </button>
          )}
        </div>
        <ul className="recipe-detail__ingredients ingredient-list">
          {ingredients.map((line) => {
            const checked = done.has(line.key)
            const classes = ['ingredient']
            if (checked) classes.push('ingredient--done')
            if (line.missing) classes.push('ingredient--missing corpus-line--missing')
            if (line.avoided) classes.push('ingredient--avoided corpus-line--avoided')
            return (
              <li key={line.key} className={classes.join(' ')}>
                <label className="ingredient__row">
                  <input
                    type="checkbox"
                    className="ingredient__input"
                    checked={checked}
                    onChange={() => toggle(line.key)}
                  />
                  <span className="ingredient__box" aria-hidden="true">
                    {checked && <Icon name="check" size={16} />}
                  </span>
                  <span className="ingredient__body">
                    <span className="ingredient__text">{line.text}</span>
                    {(line.missing || line.avoided) && (
                      <span className="ingredient__tags">
                        {line.missing && <span className="tag tag--missing">missing</span>}
                        {line.avoided && (
                          <span className="tag tag--avoided" data-testid="line-avoided">
                            {line.avoided === 'hide'
                              ? 'you avoid this'
                              : 'you avoid this — ranked lower'}
                          </span>
                        )}
                      </span>
                    )}
                    {line.notes && line.notes.length > 0 && (
                      <span className="ingredient__notes">{line.notes}</span>
                    )}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="detail-section" aria-labelledby="steps-title">
        <div className="detail-section__head">
          <h3 className="detail-section__title" id="steps-title">
            Steps
          </h3>
        </div>
        {steps.length > 0 ? (
          <ol className="recipe-detail__steps step-list">
            {steps.map((step, i) => (
              <li key={i} className="step-card">
                <span className="step-card__number" aria-hidden="true">
                  {i + 1}
                </span>
                <p className="step-card__text">{step}</p>
              </li>
            ))}
          </ol>
        ) : videoUrl ? (
          <div className="video-cta" data-testid="recipe-video">
            <p className="video-cta__text">
              <strong>Method in the video.</strong> This recipe is cooked on camera: the steps are
              in the video.
            </p>
            <a
              className="button button--primary video-cta__button"
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="play" size={22} />
              Watch the video
            </a>
          </div>
        ) : (
          <p className="note-line">No written steps for this recipe.</p>
        )}
        {steps.length > 0 && videoUrl && (
          <a
            className="button button--secondary video-cta__extra"
            href={videoUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="play" size={20} />
            Watch the video
          </a>
        )}
      </section>

      {nutrition && <NutritionCard nutrition={nutrition} />}

      {sourceUrl && (
        <p className="detail-source recipe-detail__source">
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="button button--text">
            <Icon name="link" size={18} />
            Original recipe
          </a>
        </p>
      )}
      {footer}
    </article>
  )
}

/** The favourite star for a recipe view's actions row. */
export function StarButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Remove favorite' : 'Add favorite'}
      className={`icon-button star-button${on ? ' star-button--on' : ''}`}
      onClick={onToggle}
    >
      <Icon name="star" size={22} filled={on} />
    </button>
  )
}
