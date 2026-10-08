import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, Home, Package, Receipt, Upload } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useTheme } from '@/hooks/useTheme'
import ThemeToggle from '@/components/layout/ThemeToggle'

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/orders', label: 'Orders', icon: Package, end: false },
  { to: '/import', label: 'Import', icon: Upload, end: false },
  { to: '/reports', label: 'Reports', icon: BarChart3, end: false },
  { to: '/expenses', label: 'Expenses', icon: Receipt, end: false },
]

/**
 * App frame: sticky top bar + scrollable content + fixed bottom nav.
 * Content gets bottom padding so the nav never covers page content.
 */
export default function AppShell() {
  const { theme, toggle } = useTheme()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
              M
            </span>
            <span className="text-base font-semibold tracking-tight">Munim</span>
          </div>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-[calc(var(--nav-height)_+_1rem)] pt-4">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
        aria-label="Primary"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition',
                  isActive
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                )
              }
            >
              <Icon size={20} aria-hidden />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
