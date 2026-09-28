import { useEffect, useState, useSyncExternalStore } from 'react'
import { getCorpusDb, getCorpusStatus, subscribeCorpusStatus, type CorpusStatus } from '../../db'
import type { Db } from '../../db/types'
import { loadUnits, type UnitTable } from '../units/units'
import { loadTaxonomy, type Taxonomy } from './taxonomy'

export interface CorpusHandle {
  status: CorpusStatus
  /** Set once the corpus is open and its taxonomy and units are loaded. */
  corpus: { db: Db; tax: Taxonomy; units: UnitTable } | null
}

/**
 * Opens corpus.db (once per app) and reports "loading", "downloading", "copying", "missing" or
 * "error".
 */
export function useCorpus(): CorpusHandle {
  const status = useSyncExternalStore(subscribeCorpusStatus, getCorpusStatus)
  const [corpus, setCorpus] = useState<CorpusHandle['corpus']>(null)

  useEffect(() => {
    let mounted = true
    getCorpusDb()
      .then(async (db) => {
        const [tax, units] = await Promise.all([loadTaxonomy(db), loadUnits(db)])
        if (mounted) setCorpus({ db, tax, units })
      })
      .catch(() => {
        // The status store already carries "missing" or "error" with its message.
      })
    return () => {
      mounted = false
    }
  }, [])

  return { status, corpus }
}

/** One line for a corpus that is not ready yet, or null when it is. */
export function corpusStatusText(status: CorpusStatus): string | null {
  switch (status.state) {
    case 'idle':
    case 'loading':
      return 'Opening the recipe library…'
    case 'downloading':
      return 'Getting the recipe library ready. This happens once.'
    case 'copying':
      return status.estimateSeconds > 0
        ? `Setting up the recipe library (one time, about ${status.estimateSeconds} seconds)…`
        : 'Setting up the recipe library (one time)…'
    case 'missing':
      return `The recipe library is not on this device yet. ${status.message}`
    case 'error':
      return `The recipe library could not be opened: ${status.message}`
    case 'ready':
      return null
  }
}
