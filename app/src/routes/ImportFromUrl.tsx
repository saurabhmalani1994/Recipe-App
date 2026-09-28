import { Capacitor } from '@capacitor/core'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/ui/Icon'
import { fetchRecipePage } from '../features/importUrl/fetchRecipePage'
import { parseImportInput } from '../features/importUrl/parseImportInput'
import { hasContent, type ImportedRecipe } from '../features/importUrl/types'

/**
 * "Import from link" (S12 brief #1; D6 "Import from URL", no AI. Owner: "Upload my own recipes
 * based on something i did that worked well, or to copy an existing version and make a version
 * of it with some modifications i did that I liked"). Fetches a page (native) or takes a paste
 * of its HTML or plain text (always offered, since a browser fetch usually hits CORS), parses
 * it, and shows what was understood before handing it to the editor — same as My Recipes' own
 * "what was understood" line under each ingredient, but here for the whole recipe first.
 */
export function ImportFromUrl() {
  const navigate = useNavigate()
  const native = Capacitor.isNativePlatform()

  const [url, setUrl] = useState('')
  const [pasted, setPasted] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportedRecipe | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  async function fetchAndParse() {
    if (!url.trim()) return
    setFetching(true)
    setFetchError(null)
    setParseError(null)
    setPreview(null)
    const result = await fetchRecipePage(url.trim())
    setFetching(false)
    if (!result.ok || result.html === null) {
      setFetchError(result.error ?? 'Could not fetch the page.')
      return
    }
    const recipe = parseImportInput(result.html, url.trim())
    if (!hasContent(recipe)) {
      setParseError("Couldn't find a recipe on that page. Try pasting its HTML or the recipe text below.")
      return
    }
    setPreview(recipe)
  }

  function parsePasted() {
    if (!pasted.trim()) return
    setParseError(null)
    setPreview(null)
    const recipe = parseImportInput(pasted, url.trim() || null)
    if (!hasContent(recipe)) {
      setParseError("Couldn't find any ingredients or steps in that text.")
      return
    }
    setPreview(recipe)
  }

  function openInEditor() {
    if (!preview) return
    navigate('/my-recipes/new', { state: { importedRecipe: preview } })
  }

  return (
    <section className="screen screen--import" data-testid="screen-import-url">
      <div className="card editor-card">
        <h3 className="card__title">From a link</h3>
        <label className="field">
          <span className="field__label">Recipe URL</span>
          <input
            className="field__control"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="button button--primary"
          onClick={() => void fetchAndParse()}
          disabled={fetching || !url.trim()}
        >
          <Icon name="download" size={20} />
          {fetching ? 'Fetching…' : 'Fetch and parse'}
        </button>
        {fetchError && <p className="status-line">{fetchError}</p>}
        <p className="note-line" data-testid="import-cors-note">
          {native
            ? 'Fetches the page directly on this device.'
            : "On the web, fetching a page directly usually fails because the site blocks cross-origin requests (CORS). If it does, paste the page's HTML (view source, or save the page) or just the recipe text below instead."}
        </p>
      </div>

      <div className="card editor-card">
        <h3 className="card__title">Or paste it</h3>
        <label className="field">
          <span className="field__label">Paste the page&rsquo;s HTML, or the recipe text</span>
          <textarea
            className="field__control"
            rows={7}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Paste here if fetching didn't work…"
          />
        </label>
        <button
          type="button"
          className="button button--secondary"
          onClick={parsePasted}
          disabled={!pasted.trim()}
        >
          Parse pasted content
        </button>
        {parseError && <p className="status-line">{parseError}</p>}
      </div>

      {preview && (
        <div className="card import-preview" data-testid="import-preview">
          <p className="kicker">What was understood</p>
          <h3 className="import-preview__title">{preview.title || 'Untitled recipe'}</h3>
          {preview.sourceUrl && <p className="note-line">From {preview.sourceUrl}</p>}
          <p className="meta">
            {preview.ingredients.length} ingredient{preview.ingredients.length === 1 ? '' : 's'} ·{' '}
            {preview.steps.length} step{preview.steps.length === 1 ? '' : 's'}
          </p>
          <ul className="import-preview__lines" data-testid="import-preview-ingredients">
            {preview.ingredients.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <ol className="import-preview__steps">
            {preview.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <button
            type="button"
            className="button button--primary"
            onClick={openInEditor}
            data-testid="import-open-editor"
          >
            <Icon name="edit" size={20} />
            Open in editor
          </button>
        </div>
      )}
    </section>
  )
}
