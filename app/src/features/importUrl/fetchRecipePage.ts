import { Capacitor, CapacitorHttp } from '@capacitor/core'

export interface FetchResult {
  ok: boolean
  html: string | null
  /** One line, shown as-is under the URL field. */
  error: string | null
}

/**
 * "On native, fetch with CapacitorHttp (no CORS). In the browser, a direct fetch usually fails
 * on CORS" (S12 brief #1). `CapacitorHttp` runs the request natively (Android's own HTTP stack),
 * so it never goes through the WebView's CORS checks; the plain `fetch` in a browser build does,
 * and most recipe sites don't send an `Access-Control-Allow-Origin` header that would let it
 * through — hence the paste fallback the import screen always offers alongside this.
 */
export async function fetchRecipePage(url: string): Promise<FetchResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      const response = await CapacitorHttp.get({ url })
      if (response.status >= 200 && response.status < 300) {
        return { ok: true, html: String(response.data), error: null }
      }
      return { ok: false, html: null, error: `The site returned an error (status ${response.status}).` }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, html: null, error: `Could not fetch the page: ${message}` }
    }
  }
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return { ok: false, html: null, error: `The site returned an error (status ${response.status}).` }
    }
    return { ok: true, html: await response.text(), error: null }
  } catch {
    return {
      ok: false,
      html: null,
      error:
        "Could not fetch the page directly — the site's browser may be blocking cross-origin requests (CORS).",
    }
  }
}
