import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from 'lucide-react'
import { CsvFileSource, importFromSource } from '@/import/source'
import type { ImportSummary } from '@/db/models'
import { cn } from '@/utils/cn'

type Phase = 'idle' | 'parsing' | 'done' | 'error'

interface Job {
  fileName: string
  phase: Phase
  progress: number
  summary?: ImportSummary
  error?: string
}

export default function ImportPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const runImport = async (file: File) => {
    const job: Job = { fileName: file.name, phase: 'parsing', progress: 0 }
    setJobs((prev) => [job, ...prev].slice(0, 10))

    const update = (patch: Partial<Job>) =>
      setJobs((prev) => prev.map((j) => (j.fileName === job.fileName ? { ...j, ...patch } : j)))

    try {
      const source = new CsvFileSource(file)
      const summary = await importFromSource(source, file.name, (processed) =>
        update({ progress: processed }),
      )
      update({ phase: 'done', summary, progress: summary.total })
    } catch (err) {
      update({ phase: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  const onFiles = (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
        void runImport(file)
      }
    }
  }

  const typeLabel = (t: ImportSummary['detectedType']) =>
    t === 'orders'
      ? 'Sold Orders'
      : t === 'order_items'
        ? 'Sold Order Items'
        : t === 'payments'
          ? 'Payment Account'
          : 'Unknown'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Import Etsy CSVs</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Sold Orders, Sold Order Items, and Payment Account statements. The type is detected
          automatically; importing the same file twice never creates duplicates.
        </p>
      </div>

      {/* Dropzone */}
      <div
        className={cn(
          'card flex flex-col items-center justify-center border-2 border-dashed py-10 text-center transition',
          dragOver ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-slate-300 dark:border-slate-700',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          onFiles(e.dataTransfer.files)
        }}
      >
        <FileUp className="mb-3 text-slate-400" size={32} />
        <p className="mb-1 text-sm font-medium">Drop CSV files here</p>
        <p className="mb-4 text-xs text-slate-500">or</p>
        <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
          <Upload size={16} /> Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {/* Progress / results */}
      <div className="space-y-2">
        {jobs.map((job) => (
          <div key={job.fileName} className="card !p-3">
            <div className="flex items-center gap-2">
              {job.phase === 'parsing' && <Loader2 size={16} className="animate-spin text-brand-600" />}
              {job.phase === 'done' && <CheckCircle2 size={16} className="text-emerald-600" />}
              {job.phase === 'error' && <AlertTriangle size={16} className="text-rose-600" />}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{job.fileName}</span>
              {job.phase === 'parsing' && (
                <span className="text-xs tabular-nums text-slate-400">{job.progress} rows</span>
              )}
            </div>

            {job.phase === 'parsing' && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: '60%', opacity: 0.6 }}
                />
              </div>
            )}

            {job.phase === 'error' && (
              <p className="mt-1.5 text-xs text-rose-600">{job.error}</p>
            )}

            {job.summary && (
              <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                <Stat label="Rows" value={job.summary.total} />
                <Stat label="New" value={job.summary.created} tone="text-emerald-600" />
                <Stat label="Updated" value={job.summary.updated} tone="text-brand-600" />
                <Stat label="Skipped" value={job.summary.skipped} tone="text-slate-500" />
              </div>
            )}

            {job.summary && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                Detected: {typeLabel(job.summary.detectedType)}
              </p>
            )}

            {job.summary && job.summary.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-amber-600">
                  {job.summary.errors.length} warning(s)
                </summary>
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-xs text-slate-500">
                  {job.summary.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      {e.row > 0 ? `Row ${e.row}: ` : ''}
                      {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>

      <div className="card text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Where to get these files
        </h2>
        <ol className="list-decimal space-y-1 pl-4">
          <li>Shop Manager → Finances → Orders → Download CSV (Sold Orders)</li>
          <li>Same page, switch to Order Items view → Download CSV</li>
          <li>
            Finances → Payment account → Download options → CSV of the statement period (Payment
            Account / Deposits)
          </li>
        </ol>
        <p className="mt-2">
          Files are parsed on-device; nothing is uploaded. Future Etsy API sync will plug into the
          same import layer.
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 py-1.5 dark:bg-slate-800/70">
      <div className={cn('text-sm font-semibold tabular-nums', tone)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  )
}
