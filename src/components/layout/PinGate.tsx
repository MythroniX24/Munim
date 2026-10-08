import { useState, type FormEvent, type ReactNode } from 'react'
import { LockKeyhole } from 'lucide-react'
import { usePinLock } from '@/hooks/usePinLock'

/** Full-screen gate shown on app open when a PIN is configured. */
export default function PinGate({ children }: { children: ReactNode }) {
  const { state, unlock, attempts } = usePinLock()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  if (state === 'locked') {
    const onSubmit = async (e: FormEvent) => {
      e.preventDefault()
      const ok = await unlock(pin)
      if (!ok) {
        setError('Wrong PIN')
        setPin('')
      } else {
        setError('')
      }
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 dark:bg-slate-950">
        <form onSubmit={onSubmit} className="w-full max-w-xs text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-white">
            <LockKeyhole size={26} />
          </div>
          <h1 className="mb-1 text-lg font-semibold">Munim</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Enter your PIN to unlock</p>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={(e) => {
              setPin(e.target.value)
              setError('')
            }}
            className="field mb-3 text-center text-2xl tracking-[0.5em]"
            placeholder="••••"
            aria-label="PIN"
          />
          {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={pin.length < 4}>
            Unlock
          </button>
          {attempts >= 5 && (
            <p className="mt-4 text-xs text-slate-400">Tip: clear site data resets the PIN.</p>
          )}
        </form>
      </div>
    )
  }

  return <>{children}</>
}
