import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DietFilterChip } from '../components/DietFilterChip'
import { ChipRow } from '../components/ui/Chip'
import { Icon } from '../components/ui/Icon'
import { RecipeCard, RecipeTileSkeleton } from '../components/ui/RecipeCard'
import { EmptyState, SectionHeader, Skeleton } from '../components/ui/Section'
import {
  avoidListFrom,
  newHiddenTally,
  hiddenNote as avoidHiddenNote,
} from '../features/cook/avoid'
import { cuisineLabel } from '../features/cook/labels'
import { corpusStatusText, useCorpus } from '../features/cook/useCorpus'
import { loadHomeRows } from '../features/home/homeRepo'
import { pickSurprise } from '../features/home/surprise'
import type { HomeCard, HomeRow, HomeRowId } from '../features/home/types'
import { listKitchenItems } from '../features/kitchen/kitchenRepo'
import { listAvoidIngredients } from '../features/settings/settingsRepo'
import { useDiet } from '../state/diet'

/** Editorial dressing for each row (S22a: "the 4 rows as horizontal photo carousels with good
 * titles"). The row's own title from rows.ts stays the heading; these add the kicker and a line. */
const ROW_COPY: Record<HomeRowId, { kicker: string; subtitle: string }> = {
  cook: { kicker: 'From your kitchen', subtitle: 'Recipes that use what you already have.' },
  explore: { kicker: 'Explore', subtitle: 'A cuisine you haven’t cooked lately.' },
  favorites: { kicker: 'For you', subtitle: 'More in the spirit of the recipes you’ve starred.' },
  seasonal: { kicker: 'Today', subtitle: 'Picked for the day of the week and the season.' },
}

const ROW_EMPTY_ICON: Record<HomeRowId, 'basket' | 'globe' | 'star' | 'leaf'> = {
  cook: 'basket',
  explore: 'globe',
  favorites: 'star',
  seasonal: 'leaf',
}

function greeting(date: Date): string {
  const hour = date.getHours()
  if (hour < 11) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Today's pick for the hero: the day's seasonal/weekend pick, else the best "cook" match. */
function pickHero(rows: HomeRow[]): { card: HomeCard; from: HomeRowId } | null {
  for (const id of ['seasonal', 'cook', 'explore', 'favorites'] as const) {
    const card = rows.find((row) => row.id === id)?.cards[0]
    if (card) return { card, from: id }
  }
  return null
}

function toCardData(card: HomeCard) {
  return {
    title: card.title,
    cuisine: card.cuisine,
    cuisineLabel: card.cuisine ? cuisineLabel(card.cuisine) : null,
    totalMin: card.totalMin,
    imageUrl: card.imageUrl,
    covered: card.covered,
    needed: card.needed,
  }
}

const recipeHref = (card: HomeCard) => `/recipe/${encodeURIComponent(card.key)}`

/**
 * Home (S11; docs/PRODUCT.md): owner, verbatim, "a home page that recommends interesting recipes
 * that i could make for when i am not feeling inspired to think for myself". S22a lays it out as
 * a food magazine: a masthead, today's pick as a full-width photo hero, "Surprise me", then the
 * four rows (cook with what you have, explore, like your favorites, seasonal) as photo carousels.
 */
export function Home() {
  const { status, corpus } = useCorpus()
  const { preset } = useDiet()
  const [today] = useState(() => new Date())

  const [have, setHave] = useState<string[] | null>(null)
  const [rows, setRows] = useState<HomeRow[] | null>(null)
  const [hiddenNote, setHiddenNote] = useState<string | null>(null)
  const [surprise, setSurprise] = useState<HomeCard | null | undefined>(undefined)
  const [surpriseLoading, setSurpriseLoading] = useState(false)
  // S16: "ingredients I avoid" (Settings), applied to the rows below and to Surprise me.
  const [avoid, setAvoid] = useState<ReturnType<typeof avoidListFrom>>(new Map())

  useEffect(() => {
    void listKitchenItems().then((items) => {
      setHave(items.map((item) => item.ingredientId))
    })
    void listAvoidIngredients().then((rows) => setAvoid(avoidListFrom(rows)))
  }, [])

  useEffect(() => {
    if (!corpus || have === null) return
    let current = true
    void loadHomeRows(corpus.db, corpus.tax, { have, diet: preset, avoid }).then((next) => {
      if (current) {
        setRows(next.rows)
        setHiddenNote(next.hiddenNote)
      }
    })
    return () => {
      current = false
    }
  }, [corpus, have, preset, avoid])

  async function surpriseMe() {
    if (!corpus || have === null) return
    setSurpriseLoading(true)
    try {
      const tally = newHiddenTally()
      const card = await pickSurprise(corpus.db, corpus.tax, {
        have,
        diet: preset,
        avoid,
        hiddenTally: tally,
      })
      setSurprise(card)
      const note = avoidHiddenNote(tally)
      if (note) setHiddenNote((prev) => prev ?? note)
    } finally {
      setSurpriseLoading(false)
    }
  }

  const notReady = corpus ? null : (corpusStatusText(status) ?? 'Opening the recipe library…')
  const loading = !rows
  const hero = rows ? pickHero(rows) : null

  return (
    <section className="screen screen--home" data-testid="screen-home">
      <header className="masthead">
        <p className="kicker">
          {today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h2 className="display">{greeting(today)}. What shall we cook?</h2>
      </header>

      <ChipRow label="Home filters">
        <DietFilterChip />
        <Link to="/kitchen" className="filter-chip">
          <Icon name="basket" size={18} className="filter-chip__icon" />
          <span className="filter-chip__label">What I have</span>
        </Link>
        <Link to="/favorites" className="filter-chip">
          <Icon name="star" size={18} className="filter-chip__icon" />
          <span className="filter-chip__label">Favorites</span>
        </Link>
      </ChipRow>

      {notReady && (
        <p className="status-line" role="status">
          {notReady}
        </p>
      )}

      {hiddenNote && (
        <p className="note-line" data-testid="home-hidden-avoid">
          {hiddenNote}
        </p>
      )}

      <div className="home-feature">
        {surprise ? (
          <div className="home-feature__card" data-testid="home-surprise-card" key={surprise.key}>
            <RecipeCard
              variant="hero"
              kicker="Surprise pick"
              recipe={toCardData(surprise)}
              to={recipeHref(surprise)}
            />
          </div>
        ) : hero ? (
          <div className="home-feature__card" data-testid="home-hero" key={hero.card.key}>
            <RecipeCard
              variant="hero"
              kicker="Today’s pick"
              recipe={toCardData(hero.card)}
              to={recipeHref(hero.card)}
              note={hero.card.why}
            />
          </div>
        ) : loading ? (
          <Skeleton className="skeleton--hero" />
        ) : null}

        <div className="home-surprise">
          <p className="home-surprise__prompt">
            {surprise ? 'Not quite it?' : 'Not feeling inspired?'}
            {surprise === null && (
              <span className="home-surprise__empty" data-testid="home-surprise-empty">
                {' '}
                Nothing fit right now — try loosening your diet filter.
              </span>
            )}
          </p>
          <button
            type="button"
            className="button button--primary"
            disabled={surpriseLoading || notReady !== null}
            onClick={() => void surpriseMe()}
          >
            <Icon name="dice" size={20} />
            {surprise ? 'Another surprise' : 'Surprise me'}
          </button>
        </div>
      </div>

      {loading &&
        [0, 1].map((i) => (
          <div key={i} className="home-row" aria-hidden="true">
            <div className="section-header">
              <div className="section-header__text">
                <Skeleton className="skeleton--kicker" />
                <Skeleton className="skeleton--title" />
              </div>
            </div>
            <div className="carousel">
              {[0, 1, 2].map((j) => (
                <RecipeTileSkeleton key={j} />
              ))}
            </div>
          </div>
        ))}
      {loading && corpus && (
        <p className="visually-hidden" role="status">
          Finding something for you…
        </p>
      )}

      {rows &&
        rows.map((row) => {
          // The hero already shows this row's first card: don't repeat it right underneath.
          const cards =
            hero && !surprise && hero.from === row.id && row.cards.length > 1
              ? row.cards.slice(1)
              : row.cards
          const copy = ROW_COPY[row.id]
          // Explore's reason ("You haven't cooked Korean lately") is the same for the whole row:
          // say it once, as the row's line, rather than on every card.
          const why = cards[0]?.why
          const sharedWhy = why && cards.every((card) => card.why === why) ? why : null
          return (
            <div key={row.id} className="home-row" data-testid={`home-row-${row.id}`}>
              <SectionHeader
                kicker={copy.kicker}
                title={row.title}
                subtitle={sharedWhy ?? copy.subtitle}
              />
              {cards.length === 0 ? (
                <EmptyState
                  compact
                  icon={ROW_EMPTY_ICON[row.id]}
                  title={row.emptyMessage ?? 'Nothing here yet.'}
                />
              ) : (
                <ul className="carousel home-row__scroll" aria-label={row.title}>
                  {cards.map((card, i) => (
                    <li key={card.key} className="carousel__item">
                      <RecipeCard
                        recipe={toCardData(card)}
                        to={recipeHref(card)}
                        // Mixed cuisines: the reason leads each cuisine's run of cards, once.
                        note={sharedWhy || card.why === cards[i - 1]?.why ? undefined : card.why}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
    </section>
  )
}
