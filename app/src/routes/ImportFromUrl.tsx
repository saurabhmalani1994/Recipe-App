import { Capacitor } from '@capacitor/core'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
    <section className="screen" data-testid="screen-import-url">
      <h2>Import from link</h2>

      <label className="settings-field">
        Recipe URL
        <input
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <button type="button" onClick={() => void fetchAndParse()} disabled={fetching || !url.trim()}>
        {fetching ? 'Fetching…' : 'Fetch and parse'}
      </button>
      {fetchError && <p className="screen__placeholder">{fetchError}</p>}

      <p className="screen__placeholder" data-testid="import-cors-note">
        {native
          ? 'Fetches the page directly on this device.'
          : "On the web, fetching a page directly usually fails because the site blocks cross-origin requests (CORS). If it does, paste the page's HTML (view source, or save the page) or just the recipe text below instead."}
      </p>

      <label className="settings-field">
        Paste the page&rsquo;s HTML, or the recipe text
        <textarea
          rows={8}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Paste here if fetching didn't work…"
        />
      </label>
      <button type="button" onClick={parsePasted} disabled={!pasted.trim()}>
        Parse pasted content
      </button>

      {parseError && <p className="screen__placeholder">{parseError}</p>}

      {preview && (
        <div className="import-preview" data-testid="import-preview">
          <h3>{preview.title || 'Untitled recipe'}</h3>
          {preview.sourceUrl && <p className="screen__placeholder">From {preview.sourceUrl}</p>}
          <p>
            {preview.ingredients.length} ingredient{preview.ingredients.length === 1 ? '' : 's'} ·{' '}
            {preview.steps.length} step{preview.steps.length === 1 ? '' : 's'}
          </p>
          <ul className="corpus-ingredients" data-testid="import-preview-ingredients">
            {preview.ingredients.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <ol>
            {preview.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <button type="button" onClick={openInEditor} data-testid="import-open-editor">
            Open in editor
          </button>
        </div>
      )}
    </section>
  )
}
