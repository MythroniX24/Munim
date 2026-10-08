import { useCallback, useEffect, useState } from 'react'
import { db, ensureSettings } from '@/db/db'

/**
 * PIN lock. The hash (SHA-256 of salt:pin) lives in IndexedDB settings —
 * it only guards casual snooping on an unlocked device, not real security.
 */

const UNLOCK_KEY = 'munim.unlocked'

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type LockState = 'loading' | 'unlocked' | 'locked' | 'setup'

export function usePinLock() {
  const [state, setState] = useState<LockState>('loading')
  const [attempts, setAttempts] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const settings = await ensureSettings()
      if (cancelled) return
      if (!settings.pinHash) {
        setState('unlocked')
        return
      }
      try {
        setState(sessionStorage.getItem(UNLOCK_KEY) === '1' ? 'unlocked' : 'locked')
      } catch {
        setState('locked')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const unlock = useCallback(
    async (pin: string): Promise<boolean> => {
      const settings = await db.settings.get('app')
      if (!settings?.pinHash || !settings.pinSalt) {
        setState('unlocked')
        return true
      }
      const hash = await sha256Hex(`${settings.pinSalt}:${pin}`)
      const ok = hash === settings.pinHash
      if (ok) {
        try {
          sessionStorage.setItem(UNLOCK_KEY, '1')
        } catch {
          /* ignore */
        }
        setState('unlocked')
        setAttempts(0)
      } else {
        setAttempts((a) => a + 1)
      }
      return ok
    },
    [],
  )

  /** Set/change PIN. Empty string removes it. */
  const setPin = useCallback(async (pin: string) => {
    const settings = await ensureSettings()
    if (!pin) {
      await db.settings.put({ ...settings, pinHash: undefined, pinSalt: undefined })
      setState('unlocked')
      return
    }
    const salt = randomSalt()
    const pinHash = await sha256Hex(`${salt}:${pin}`)
    await db.settings.put({ ...settings, pinHash, pinSalt: salt })
    try {
      sessionStorage.setItem(UNLOCK_KEY, '1')
    } catch {
      /* ignore */
    }
    setState('unlocked')
  }, [])

  const lock = useCallback(() => {
    try {
      sessionStorage.removeItem(UNLOCK_KEY)
    } catch {
      /* ignore */
    }
    setState('locked')
  }, [])

  return { state, unlock, setPin, lock, attempts }
}
