import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cuisineLabel } from '../features/cook/labels'
import { corpusStatusText, useCorpus } from '../features/cook/useCorpus'
import { loadHomeRows } from '../features/home/homeRepo'
import { pickSurprise } from '../features/home/surprise'
import type { HomeCard, HomeRow } from '../features/home/types'
import { listKitchenItems } from '../features/kitchen/kitchenRepo'
import { useDiet } from '../state/diet'

/**
 * Home (S11; docs/PRODUCT.md): owner, verbatim, "a home page that recommends interesting recipes
 * that i could make for when i am not feeling inspired to think for myself". Four horizontally
 * scrollable rows, each a fresh (but stable-for-the-day) pick over the corpus: cook with what you
 * have, explore a cuisine you haven't lately, more like your favorites, and today's
 * seasonal/weeknight or weekend pick — plus a "Surprise me" button for one random high-quality
 * recipe outside those rows.
 */
export function Home() {
  const { status, corpus } = useCorpus()
  const { preset } = useDiet()

  const [have, setHave] = useState<string[] | null>(null)
  const [rows, setRows] = useState<HomeRow[] | null>(null)
  const [surprise, setSurprise] = useState<HomeCard | null | undefined>(undefined)
  const [surpriseLoading, setSurpriseLoading] = useState(false)

  useEffect(() => {
    void listKitchenItems().then((items) => {
      setHave(items.map((item) => item.ingredientId))
    })
  }, [])

  useEffect(() => {
    if (!corpus || have === null) return
    let current = true
    void loadHomeRows(corpus.db, corpus.tax, { have, diet: preset }).then((next) => {
      if (current) setRows(next)
    })
    return () => {
      current = false
    }
  }, [corpus, have, preset])

  async function surpriseMe() {
    if (!corpus || have === null) return
    setSurpriseLoading(true)
    try {
      const card = await pickSurprise(corpus.db, corpus.tax, { have, diet: preset })
      setSurprise(card)
    } finally {
      setSurpriseLoading(false)
    }
  }

  const notReady = corpus ? null : (corpusStatusText(status) ?? 'Opening the recipe library…')

  return (
    <section className="screen" data-testid="screen-home">
      <h2>Home</h2>

      <div className="home-shortcuts">
        <Link to="/favorites">★ Favorites</Link>
        <Link to="/kitchen">🧺 What I have</Link>
      </div>

      <div className="home-surprise">
        <button type="button" disabled={surpriseLoading || notReady !== null} onClick={() => void surpriseMe()}>
          🎲 Surprise me
        </button>
        {surprise === null && (
          <p className="screen__placeholder" data-testid="home-surprise-empty">
            Nothing fit right now — try loosening your diet filter.
          </p>
        )}
        {surprise && (
          <div className="home-surprise__card" data-testid="home-surprise-card">
            <HomeCardView card={surprise} />
          </div>
        )}
      </div>

      {notReady && <p className="screen__placeholder">{notReady}</p>}

      {corpus && rows === null && !notReady && (
        <p className="screen__placeholder">Finding something for you…</p>
      )}

      {corpus &&
        rows &&
        rows.map((row) => (
          <div key={row.id} className="home-row" data-testid={`home-row-${row.id}`}>
            <h3 className="home-row__title">{row.title}</h3>
            {row.cards.length === 0 ? (
              <p className="screen__placeholder">{row.emptyMessage}</p>
            ) : (
              <ul className="home-row__scroll" aria-label={row.title}>
                {row.cards.map((card) => (
                  <li key={card.key} className="home-card">
                    <HomeCardView card={card} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
    </section>
  )
}

function HomeCardView({ card }: { card: HomeCard }) {
  return (
    <Link to={`/recipe/${encodeURIComponent(card.key)}`} className="home-card__link">
      {card.imageUrl && <img className="home-card__image" src={card.imageUrl} alt="" loading="lazy" />}
      <span className="home-card__title">{card.title}</span>
      <span className="home-card__meta">
        {[
          card.cuisine ? cuisineLabel(card.cuisine) : null,
          card.totalMin !== null ? `${card.totalMin} min` : null,
          card.needed > 0 ? `you have ${card.covered}/${card.needed}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
      {card.why && <span className="home-card__why">{card.why}</span>}
    </Link>
  )
}
