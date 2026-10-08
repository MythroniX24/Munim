import { useLiveQuery } from 'dexie-react-hooks'
import { db, ensureSettings } from '@/db/db'
import { DEFAULT_SETTINGS, type Settings } from '@/db/models'

/** Live settings with defaults. */
export function useSettings(): Settings {
  const settings = useLiveQuery(
    async () => {
      await ensureSettings()
      return db.settings.get('app')
    },
    [],
    DEFAULT_SETTINGS,
  )
  return settings ?? DEFAULT_SETTINGS
}

/** Convert blob logo → data URL for jsPDF headers. */
export async function logoToDataUrl(logo: Blob | undefined): Promise<string | undefined> {
  if (!logo) return undefined
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => resolve(undefined)
    reader.readAsDataURL(logo)
  })
}
