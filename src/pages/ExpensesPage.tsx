import { useMemo, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Pencil, Plus, Trash2, X, RefreshCw } from 'lucide-react'
import { db } from '@/db/db'
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type RecurringFrequency,
} from '@/db/models'
import { useSettings } from '@/hooks/useSettings'
import { formatMoney } from '@/utils/money'
import { toDateInput, fromDateInput } from '@/utils/dates'
import { totalExpenses } from '@/utils/calc'

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  'silver-materials': 'Silver materials',
  'gold-plating': 'Gold plating',
  packaging: 'Packaging',
  'shipping-labels': 'Shipping labels',
  'etsy-ads': 'Etsy ads',
  tools: 'Tools',
  photography: 'Photography',
  other: 'Other',
}

const FREQUENCIES: { id: RecurringFrequency; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
]

interface Draft {
  id?: number
  date: string
  amount: string
  category: ExpenseCategory
  vendor: string
  notes: string
  receipt?: Blob
  receiptPreview?: string
  recurring: boolean
  frequency: RecurringFrequency
  interval: number
  endDate: string
}

const emptyDraft = (): Draft => ({
  date: toDateInput(Date.now()),
  amount: '',
  category: 'packaging',
  vendor: '',
  notes: '',
  recurring: false,
  frequency: 'monthly',
  interval: 1,
  endDate: '',
})

export default function ExpensesPage() {
  const settings = useSettings()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [viewMonth, setViewMonth] = useState(() => toDateInput(Date.now()).slice(0, 7))

  const expenses = useLiveQuery(
    () => db.expenses.orderBy('date').reverse().toArray(),
    [],
    [],
  )!

  const monthExpenses = useMemo(
    () => expenses.filter((e) => toDateInput(e.date).startsWith(viewMonth)),
    [expenses, viewMonth],
  )

  const monthTotal = totalExpenses(monthExpenses)
  const allTotal = totalExpenses(expenses)

  const openNew = () => setDraft(emptyDraft())
  const openEdit = (e: Expense) => {
    setDraft({
      id: e.id,
      date: toDateInput(e.date),
      amount: String(e.amount),
      category: e.category,
      vendor: e.vendor ?? '',
      notes: e.notes ?? '',
      receipt: e.receipt,
      recurring: Boolean(e.recurring),
      frequency: e.recurring?.frequency ?? 'monthly',
      interval: e.recurring?.interval ?? 1,
      endDate: e.recurring?.endDate ? toDateInput(e.recurring.endDate) : '',
    })
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!draft) return
    const amount = parseFloat(draft.amount)
    if (!Number.isFinite(amount) || amount < 0) return

    const record: Omit<Expense, 'id'> = {
      date: fromDateInput(draft.date),
      amount,
      currency: settings.currency,
      category: draft.category,
      vendor: draft.vendor.trim() || undefined,
      notes: draft.notes.trim() || undefined,
      receipt: draft.receipt,
      createdAt: Date.now(),
      recurring: draft.recurring
        ? {
            frequency: draft.frequency,
            interval: Math.max(1, draft.interval),
            endDate: draft.endDate ? fromDateInput(draft.endDate) : undefined,
          }
        : undefined,
    }

    if (draft.id != null) {
      const existing = await db.expenses.get(draft.id)
      await db.expenses.put({ ...existing, ...record, id: draft.id, createdAt: existing?.createdAt ?? Date.now() })
    } else {
      await db.expenses.add(record as Expense)
    }
    setDraft(null)
  }

  const remove = async (id: number) => {
    await db.expenses.delete(id)
    setConfirmDelete(null)
  }

  const attachReceipt = (file: File | undefined) => {
    if (!file || !draft) return
    setDraft({
      ...draft,
      receipt: file,
      receiptPreview: URL.createObjectURL(file),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Expenses</h1>
        <button type="button" className="btn-primary" onClick={openNew}>
          <Plus size={16} /> Add
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="month"
          className="field w-auto"
          value={viewMonth}
          onChange={(e) => setViewMonth(e.target.value)}
          aria-label="Filter by month"
        />
        <div className="ml-auto text-right">
          <div className="text-xs text-slate-400">This month</div>
          <div className="text-sm font-semibold tabular-nums">
            {formatMoney(monthTotal, settings.currency)}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {monthExpenses.length === 0 && (
          <p className="card text-center text-sm text-slate-400">No expenses this month.</p>
        )}
        {monthExpenses.map((e) => (
          <div key={e.id} className="card flex items-center gap-3 !p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {CATEGORY_LABELS[e.category].split(' ')[0].slice(0, 4)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">
                  {CATEGORY_LABELS[e.category]}
                </span>
                {e.recurring && (
                  <RefreshCw
                    size={12}
                    className="shrink-0 text-brand-600 dark:text-brand-400"
                    aria-label="Recurring"
                  />
                )}
                {e.receipt && (
                  <Camera size={12} className="shrink-0 text-slate-400" aria-label="Has receipt" />
                )}
              </div>
              <div className="truncate text-xs text-slate-500">
                {toDateInput(e.date)}
                {e.vendor && ` · ${e.vendor}`}
              </div>
            </div>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {formatMoney(e.amount, e.currency || settings.currency)}
            </span>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => openEdit(e)}
                aria-label="Edit expense"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                onClick={() => setConfirmDelete(e.id!)}
                aria-label="Delete expense"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {expenses.length > 0 && (
        <p className="text-center text-xs text-slate-400">
          All-time total: {formatMoney(allTotal, settings.currency)}
        </p>
      )}

      {/* Delete confirmation */}
      {confirmDelete != null && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="card w-full max-w-sm">
            <h2 className="mb-1 text-sm font-semibold">Delete this expense?</h2>
            <p className="mb-4 text-xs text-slate-500">This cannot be undone.</p>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger flex-1"
                onClick={() => remove(confirmDelete)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/edit sheet */}
      {draft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <form
            onSubmit={submit}
            className="max-h-[92vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-3xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{draft.id != null ? 'Edit' : 'Add'} expense</h2>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <label className="block text-xs font-medium text-slate-500">
              Amount *
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                className="field mt-1"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                placeholder="0.00"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-slate-500">
                Date *
                <input
                  type="date"
                  required
                  className="field mt-1"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-slate-500">
                Category *
                <select
                  className="field mt-1"
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value as ExpenseCategory })
                  }
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-xs font-medium text-slate-500">
              Vendor
              <input
                className="field mt-1"
                value={draft.vendor}
                onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
                placeholder="e.g. Rio Grande"
              />
            </label>

            <label className="block text-xs font-medium text-slate-500">
              Notes
              <textarea
                className="field mt-1 min-h-16"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>

            {/* Receipt photo */}
            <div>
              <span className="text-xs font-medium text-slate-500">Receipt photo</span>
              <div className="mt-1 flex items-center gap-3">
                <label className="btn-ghost cursor-pointer">
                  <Camera size={16} />
                  {draft.receipt ? 'Replace' : 'Attach'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => attachReceipt(e.target.files?.[0])}
                  />
                </label>
                {(draft.receiptPreview || draft.receipt) && (
                  <img
                    src={
                      draft.receiptPreview ??
                      (draft.receipt ? URL.createObjectURL(draft.receipt) : undefined)
                    }
                    alt="Receipt"
                    className="h-12 w-12 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                  />
                )}
              </div>
            </div>

            {/* Recurring */}
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-600"
                  checked={draft.recurring}
                  onChange={(e) => setDraft({ ...draft, recurring: e.target.checked })}
                />
                <RefreshCw size={14} className="text-brand-600" />
                Recurring expense
              </label>
              {draft.recurring && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <label className="block text-xs font-medium text-slate-500">
                    Frequency
                    <select
                      className="field mt-1"
                      value={draft.frequency}
                      onChange={(e) =>
                        setDraft({ ...draft, frequency: e.target.value as RecurringFrequency })
                      }
                    >
                      {FREQUENCIES.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-slate-500">
                    Every
                    <input
                      type="number"
                      min="1"
                      className="field mt-1"
                      value={draft.interval}
                      onChange={(e) =>
                        setDraft({ ...draft, interval: parseInt(e.target.value, 10) || 1 })
                      }
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-500">
                    Ends
                    <input
                      type="date"
                      className="field mt-1"
                      value={draft.endDate}
                      onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" className="btn-ghost flex-1" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1">
                {draft.id != null ? 'Save' : 'Add expense'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
