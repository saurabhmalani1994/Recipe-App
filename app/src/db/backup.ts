import type { Db, SqlParam } from './types'
import { USER_DB_TABLES } from './userSchema'

export interface BackupFile {
  format: 'recipe-app-user-backup'
  version: 1
  exportedAt: string
  tables: Record<string, Record<string, unknown>[]>
}

/** Reads every `user.db` table into one JSON-serialisable object. */
export async function exportUserDb(db: Db): Promise<BackupFile> {
  const tables: Record<string, Record<string, unknown>[]> = {}
  for (const table of USER_DB_TABLES) {
    const result = await db.query(`SELECT * FROM ${table}`)
    tables[table] = result.rows
  }
  return {
    format: 'recipe-app-user-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  }
}

/**
 * Replaces every `user.db` table's contents with the rows in `backup`, inside one
 * transaction. Unknown tables in the file (a future migration's) are ignored; tables
 * missing from the file are left untouched rather than wiped.
 */
export async function importUserDb(db: Db, backup: BackupFile): Promise<void> {
  if (backup.format !== 'recipe-app-user-backup') {
    throw new Error(`not a recipe-app backup file (got "${backup.format}")`)
  }
  await db.transaction(async () => {
    for (const table of USER_DB_TABLES) {
      const rows = backup.tables[table]
      if (!rows) continue
      await db.run(`DELETE FROM ${table}`)
      for (const row of rows) {
        const columns = Object.keys(row)
        if (columns.length === 0) continue
        const placeholders = columns.map(() => '?').join(', ')
        const values = columns.map((column) => row[column] as SqlParam)
        await db.run(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
          values,
        )
      }
    }
  })
}

export function backupFileName(date = new Date()): string {
  return `recipe-app-backup-${date.toISOString().slice(0, 10)}.json`
}

/**
 * Shares the backup on native (Android share sheet, e.g. to Drive or Files) and triggers a
 * browser download on the web.
 */
export async function shareBackup(backup: BackupFile): Promise<void> {
  const json = JSON.stringify(backup, null, 2)
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import('@capacitor/share')
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const fileName = backupFileName()
    await Filesystem.writeFile({
      path: fileName,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache })
    await Share.share({ title: 'Recipe App backup', url: uri })
    return
  }
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = backupFileName()
  link.click()
  URL.revokeObjectURL(url)
}
