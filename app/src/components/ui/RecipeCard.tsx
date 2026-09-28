import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Cuisine } from '../../corpus/types'
import { Icon } from './Icon'
import { dishInitial, haveLabel, placeholderTone, useOnline } from './recipeVisuals'

interface RecipeImageProps {
  src: string | null | undefined
  title: string
  cuisine: Cuisine | null
  className?: string
  /** Load immediately (the hero above the fold) instead of lazily. */
  eager?: boolean
}

/**
 * A recipe photo when there is one and the device is online; otherwise (or if it fails to load)
 * a cuisine-coloured placeholder with the dish's initial in the display serif.
 */
export function RecipeImage({
  src,
  title,
  cuisine,
  className = '',
  eager = false,
}: RecipeImageProps) {
  const online = useOnline()
  const [failed, setFailed] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<string | null>(null)
  const showPhoto = Boolean(src) && online && failed !== src
  const tone = placeholderTone(cuisine, title)
  return (
    <span
      className={`recipe-image recipe-image--tone-${tone} ${className}`}
      data-photo={showPhoto && loaded === src ? 'loaded' : showPhoto ? 'loading' : 'none'}
    >
      <span className="recipe-image__initial" aria-hidden="true">
        {dishInitial(title)}
      </span>
      {showPhoto && src && (
        <img
          className="recipe-image__photo"
          src={src}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
        />
      )}
    </span>
  )
}

export interface RecipeCardData {
  title: string
  cuisine: Cuisine | null
  cuisineLabel?: string | null
  totalMin: number | null
  imageUrl?: string | null
  covered?: number
  needed?: number
}

interface RecipeCardProps {
  recipe: RecipeCardData
  to: string
  linkState?: unknown
  /** tile: a carousel card, photo on top. hero: the full-width feature with text over the photo. */
  variant?: 'tile' | 'hero'
  kicker?: string
  /** A short editorial line under the title (Explore's "You haven't cooked Korean lately"). */
  note?: ReactNode
  testId?: string
}

export function CoverageMeter({ covered, needed }: { covered: number; needed: number }) {
  const label = haveLabel(covered, needed)
  if (!label) return null
  const full = covered >= needed
  return (
    <span className={`coverage${full ? ' coverage--full' : ''}`}>
      <span className="coverage__bar" aria-hidden="true">
        <span
          className="coverage__fill"
          style={{ width: `${Math.round((covered / needed) * 100)}%` }}
        />
      </span>
      <span className="coverage__label">{label}</span>
    </span>
  )
}

function metaLine(recipe: RecipeCardData): ReactNode {
  const parts: ReactNode[] = []
  if (recipe.cuisineLabel) parts.push(<span key="c">{recipe.cuisineLabel}</span>)
  if (recipe.totalMin !== null) {
    parts.push(
      <span key="t" className="meta__time">
        <Icon name="clock" size={14} />
        {recipe.totalMin} min
      </span>,
    )
  }
  return parts.length > 0 ? parts : null
}

/** A photo-led recipe card (S22a): the image is the hero, the serif title sits under or over it. */
export function RecipeCard({
  recipe,
  to,
  linkState,
  variant = 'tile',
  kicker,
  note,
  testId,
}: RecipeCardProps) {
  const meta = metaLine(recipe)
  if (variant === 'hero') {
    return (
      <Link
        to={to}
        state={linkState}
        className={`recipe-hero recipe-image--tone-${placeholderTone(recipe.cuisine, recipe.title)}`}
        data-testid={testId}
      >
        <RecipeImage
          src={recipe.imageUrl}
          title={recipe.title}
          cuisine={recipe.cuisine}
          className="recipe-hero__image"
          eager
        />
        <span className="recipe-hero__scrim" aria-hidden="true" />
        <span className="recipe-hero__text">
          {kicker && <span className="recipe-hero__kicker">{kicker}</span>}
          <span className="recipe-hero__title">{recipe.title}</span>
          {meta && <span className="recipe-hero__meta meta">{meta}</span>}
          {note && <span className="recipe-hero__note">{note}</span>}
        </span>
      </Link>
    )
  }
  return (
    <Link to={to} state={linkState} className="recipe-tile" data-testid={testId}>
      <RecipeImage
        src={recipe.imageUrl}
        title={recipe.title}
        cuisine={recipe.cuisine}
        className="recipe-tile__image"
      />
      <span className="recipe-tile__body">
        <span className="recipe-tile__title">{recipe.title}</span>
        {meta && <span className="recipe-tile__meta meta">{meta}</span>}
        {note && <span className="recipe-tile__note">{note}</span>}
        {/* "You have 0 of 9" on a browsing card is noise: the meter shows once there's a match. */}
        {recipe.needed !== undefined && recipe.needed > 0 && (recipe.covered ?? 0) > 0 && (
          <CoverageMeter covered={recipe.covered ?? 0} needed={recipe.needed} />
        )}
      </span>
    </Link>
  )
}

/** Skeleton stand-ins shaped like the cards above, while a row loads. */
export function RecipeTileSkeleton() {
  return (
    <span className="recipe-tile recipe-tile--skeleton" aria-hidden="true">
      <span className="skeleton recipe-tile__image" />
      <span className="recipe-tile__body">
        <span className="skeleton skeleton--text" style={{ width: '85%' }} />
        <span className="skeleton skeleton--text" style={{ width: '55%' }} />
      </span>
    </span>
  )
}
