import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Database,
  Image as ImageIcon,
  KeyRound,
  Lock,
  Save,
  Trash2,
  Upload,
  Download,
} from 'lucide-react'
import { clearAllData, db, ensureSettings } from '@/db/db'
import { DEFAULT_SETTINGS, type Expense } from '@/db/models'
import { useSettings } from '@/hooks/useSettings'
import { usePinLock } from '@/hooks/usePinLock'
import { downloadText } from '@/reports/csv'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR', 'PKR', 'AED', 'TRY', 'PLN', 'SEK']

export default function SettingsPage() {
  const settings = useSettings()
  const { setPin } = usePinLock()
  const logoInput = useRef<HTMLInputElement>(null)

  const [shopName, setShopName] = useState(settings.shopName ?? '')
  const [address, setAddress] = useState(settings.address ?? '')
  const [currency, setCurrency] = useState(settings.currency)
  const [baseCurrency, setBaseCurrency] = useState(settings.baseCurrency)
  const [rates, setRates] = useState(settings.rates)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const [pinInput, setPinInput] = useState('')
  const [pinMessage, setPinMessage] = useState('')

  const [newRateCode, setNewRateCode] = useState('')
  const [newRateValue, setNewRateValue] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearText, setClearText] = useState('')
  const restoreInput = useRef<HTMLInputElement>(null)

  const orderCount = useLiveQuery(() => db.orders.count(), [], 0)
  const expenseCount = useLiveQuery(() => db.expenses.count(), [], 0)

  // Re-sync local state when the live settings row changes (e.g. after restore)
  useEffect(() => {
    setShopName(settings.shopName ?? '')
    setAddress(settings.address ?? '')
    setCurrency(settings.currency)
    setBaseCurrency(settings.baseCurrency)
    setRates(settings.rates)
  }, [settings])

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    try {
      const current = await ensureSettings()
      await db.settings.put({
        ...current,
        shopName: shopName.trim() || undefined,
        address: address.trim() || undefined,
        currency,
        baseCurrency,
        rates,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setBusy(false)
    }
  }

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return
    const current = await ensureSettings()
    await db.settings.put({ ...current, logo: file })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const applyPin = async (e: FormEvent) => {
    e.preventDefault()
    if (pinInput.length > 0 && pinInput.length < 4) {
      setPinMessage('PIN must be at least 4 digits')
      return
    }
    await setPin(pinInput)
    setPinInput('')
    setPinMessage(settings.pinHash ? 'PIN updated / removed' : 'PIN set')
    setTimeout(() => setPinMessage(''), 2500)
  }

  // ---- backup / restore ----

  const backup = async () => {
    setBusy(true)
    try {
      const payload = {
        app: 'munim',
        version: 1,
        exportedAt: new Date().toISOString(),
        orders: await db.orders.toArray(),
        orderItems: await db.orderItems.toArray(),
        payments: await db.payments.toArray(),
        expenses: (await db.expenses.toArray()).map((e) => e),
        products: await db.products.toArray(),
        settings: await ensureSettings(),
      }
      // Blobs can't go straight into JSON — convert them.
      const settingsRow = payload.settings
      const serializable = {
        ...payload,
        settings: settingsRow
          ? { ...settingsRow, logo: settingsRow.logo ? await blobToDataUrl(settingsRow.logo) : undefined }
          : settingsRow,
        expenses: await Promise.all(
          payload.expenses.map(async (exp) => ({
            ...exp,
            receipt: exp.receipt ? await blobToDataUrl(exp.receipt) : undefined,
          })),
        ),
      }
      downloadText(JSON.stringify(serializable), `munim-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
    } finally {
      setBusy(false)
    }
  }

  const restore = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (data.app !== 'munim') throw new Error('Not a Munim backup file')

      // Convert base64 blobs BEFORE opening the transaction — IndexedDB
      // transactions auto-close while awaiting non-IDB promises (e.g. fetch).
      const expenses: Expense[] = await Promise.all(
        (data.expenses ?? []).map(
          async (e: Record<string, unknown>): Promise<Expense> => ({
            ...(e as Omit<Expense, 'receipt'>),
            receipt:
              typeof e.receipt === 'string'
                ? await dataUrlToBlob(e.receipt)
                : (e.receipt as Blob | undefined),
          }),
        ),
      )
      const restoredSettings =
        data.settings != null
          ? {
              ...DEFAULT_SETTINGS,
              ...data.settings,
              logo:
                typeof data.settings.logo === 'string'
                  ? await dataUrlToBlob(data.settings.logo)
                  : (data.settings.logo as Blob | undefined),
            }
          : undefined

      await db.transaction(
        'rw',
        db.orders,
        db.orderItems,
        db.payments,
        db.expenses,
        db.products,
        db.settings,
        async () => {
          await db.orders.bulkPut(data.orders ?? [])
          await db.orderItems.bulkPut(data.orderItems ?? [])
          await db.payments.bulkPut(data.payments ?? [])
          await db.expenses.bulkPut(expenses)
          await db.products.bulkPut(data.products ?? [])
          if (restoredSettings) await db.settings.put(restoredSettings)
        },
      )
      setPinMessage('Backup restored')
      setTimeout(() => setPinMessage(''), 2500)
    } catch (err) {
      setPinMessage(`Restore failed: ${err instanceof Error ? err.message : 'bad file'}`)
      setTimeout(() => setPinMessage(''), 4000)
    } finally {
      setBusy(false)
    }
  }

  const wipe = async () => {
    await clearAllData()
    setConfirmClear(false)
    setClearText('')
    setPinMessage('All data cleared')
    setTimeout(() => setPinMessage(''), 2500)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Settings</h1>

      {pinMessage && (
        <p className="card border-brand-300 bg-brand-50 text-sm text-brand-800 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
          {pinMessage}
        </p>
      )}

      {/* Shop & PDF header */}
      <form className="card space-y-3" onSubmit={save}>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ImageIcon size={15} /> Shop & PDF header
        </h2>
        <label className="block text-xs font-medium text-slate-500">
          Shop name
          <input className="field mt-1" value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Your Etsy shop" />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Address (printed on PDFs)
          <textarea className="field mt-1 min-h-16" value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <div>
          <span className="text-xs font-medium text-slate-500">Logo</span>
          <div className="mt-1 flex items-center gap-3">
            {logoBlobUrl(settings.logo) && (
              <img
                src={logoBlobUrl(settings.logo)}
                alt="Shop logo"
                className="h-12 w-12 rounded-lg border border-slate-200 object-contain dark:border-slate-700"
              />
            )}
            <label className="btn-ghost cursor-pointer">
              <Upload size={15} /> Upload logo
              <input
                ref={logoInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => uploadLogo(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>
          <Save size={16} /> {saved ? 'Saved!' : 'Save'}
        </button>
      </form>

      {/* Currency */}
      <form className="card space-y-3" onSubmit={save}>
        <h2 className="text-sm font-semibold">Currency & conversion</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-slate-500">
            Shop currency
            <select className="field mt-1" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Base currency
            <select className="field mt-1" value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <span className="text-xs font-medium text-slate-500">
            Manual rates (1 unit of base currency = how many units of code)
          </span>
          <div className="mt-1.5 space-y-1.5">
            {Object.entries(rates).map(([code, rate]) => (
              <div key={code} className="flex items-center gap-2">
                <span className="w-14 font-mono text-sm">{code}</span>
                <input
                  type="number"
                  step="0.000001"
                  className="field flex-1"
                  value={rate}
                  onChange={(e) =>
                    setRates({ ...rates, [code]: parseFloat(e.target.value) || 0 })
                  }
                />
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  onClick={() => {
                    const next = Object.fromEntries(
                      Object.entries(rates).filter(([k]) => k !== code),
                    )
                    setRates(next)
                  }}
                  aria-label={`Remove rate ${code}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                className="field w-20 font-mono"
                placeholder="EUR"
                value={newRateCode}
                maxLength={3}
                onChange={(e) => setNewRateCode(e.target.value.toUpperCase())}
                aria-label="Currency code"
              />
              <input
                type="number"
                step="0.000001"
                className="field flex-1"
                placeholder="rate"
                value={newRateValue}
                onChange={(e) => setNewRateValue(e.target.value)}
                aria-label="Rate"
              />
              <button
                type="button"
                className="btn-ghost"
                disabled={!newRateCode || !newRateValue}
                onClick={() => {
                  setRates({ ...rates, [newRateCode]: parseFloat(newRateValue) || 0 })
                  setNewRateCode('')
                  setNewRateValue('')
                }}
              >
                Add
              </button>
            </div>
          </div>
          {Object.keys(rates).length > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              Example: 100 {baseCurrency} ={' '}
              {(100 * rates[Object.keys(rates)[0]]).toFixed(2)} {Object.keys(rates)[0]}
            </p>
          )}
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>
          <Save size={16} /> {saved ? 'Saved!' : 'Save'}
        </button>
      </form>

      {/* PIN */}
      <form className="card space-y-3" onSubmit={applyPin}>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound size={15} /> PIN lock {settings.pinHash ? '(on)' : '(off)'}
        </h2>
        <p className="text-xs text-slate-500">
          Locks the app when it opens. Hash-only storage — this guards against casual snooping, not
          an attacker with device access.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            inputMode="numeric"
            className="field flex-1"
            placeholder={settings.pinHash ? 'New PIN (empty = remove)' : 'Set PIN (min 4)'}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            minLength={pinInput ? 4 : undefined}
          />
          <button type="submit" className="btn-primary">
            {settings.pinHash ? 'Update' : 'Set PIN'}
          </button>
        </div>
        {settings.pinHash && (
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={async () => {
              await setPin('')
              setPinMessage('PIN removed')
              setTimeout(() => setPinMessage(''), 2500)
            }}
          >
            <Lock size={15} /> Remove PIN
          </button>
        )}
      </form>

      {/* Backup */}
      <div className="card space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Database size={15} /> Backup & restore
        </h2>
        <p className="text-xs text-slate-500">
          {orderCount ?? 0} orders · {expenseCount ?? 0} expenses stored on this device.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-primary" onClick={backup} disabled={busy}>
            <Download size={16} /> Export JSON backup
          </button>
          <label className="btn-ghost cursor-pointer justify-center">
            <Upload size={16} /> Restore from JSON
            <input
              ref={restoreInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => restore(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>

      {/* Danger zone */}
      <div className="card space-y-3 border-rose-300 dark:border-rose-900">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-400">
          <Trash2 size={15} /> Danger zone
        </h2>
        {!confirmClear ? (
          <button type="button" className="btn-danger" onClick={() => setConfirmClear(true)}>
            Clear all data
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Deletes every order, payment, expense, product and setting on this device. Export a
              backup first. Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              className="field"
              placeholder="DELETE"
              value={clearText}
              onChange={(e) => setClearText(e.target.value)}
              aria-label="Type DELETE to confirm"
            />
            <div className="flex gap-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger flex-1"
                disabled={clearText !== 'DELETE'}
                onClick={wipe}
              >
                Delete everything
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- helpers ----

const logoUrlCache = new WeakMap<Blob, string>()

function logoBlobUrl(logo: Blob | undefined): string | undefined {
  if (!logo) return undefined
  let url = logoUrlCache.get(logo)
  if (!url) {
    url = URL.createObjectURL(logo)
    logoUrlCache.set(logo, url)
  }
  return url
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((r) => r.blob())
}
