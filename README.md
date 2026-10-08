# Munim — personal Etsy accounting (PWA)

A local-first Etsy accounting app for one seller. Built with Vite + React + TypeScript +
Tailwind CSS. **All data stays on your device in IndexedDB** — nothing is ever uploaded
anywhere. Works offline, installs as a PWA, designed mobile-first (bottom nav, large tap
targets, dark/light mode, optional PIN lock).

## Features

- **Dashboard** — gross sales, Etsy fees, shipping collected vs cost, net revenue,
  expenses, net profit, order count, AOV; monthly revenue-vs-profit, top products, and
  sales-by-country charts with date-range filters.
- **Orders** — search/filter (date, status, country, product, buyer, order ID), order
  detail with fees/discounts/taxes/notes, single & bulk PDF export, filtered CSV export.
- **Sales reports** — summary, product-wise, monthly, country-wise, fees breakdown,
  profit & loss. Every report exports as a styled PDF (title, date range, page numbers)
  or CSV.
- **Expenses** — CRUD with categories, receipt photos, recurring rules, monthly totals.
- **Product costing** — per-product COGS (material, plating, packaging, labour) feeding
  per-order and per-product profit.
- **Import** — Etsy CSVs (Sold Orders, Sold Order Items, Payment Account). Type is
  auto-detected from headers, columns mapped flexibly, deduplicated by Order ID so
  re-importing never creates duplicates. Large files (10k+ rows) stream in chunks
  without freezing the UI.
- **Settings** — shop name / address / logo for PDF headers, shop & base currency with
  manual conversion rates, JSON backup & restore, PIN lock, clear-all-data.

## Termux: install & run

```bash
pkg install nodejs-lts git
git clone <your-repo-url> munim && cd munim

npm install          # install dependencies
npm run icons        # generate PWA icons (also runs automatically on dev/build)
npm run dev          # dev server → http://localhost:5173
```

Other commands:

```bash
npm test             # unit tests (Vitest)
npm run typecheck    # TypeScript, no emit
npm run build        # production build → dist/
npm run preview      # serve the production build locally
```

## Deploy to GitHub Pages

The workflow at `.github/workflows/deploy.yml` tests, builds (with the correct
`BASE_PATH` for a project site), and deploys on every push to `main`.

1. Push the repo to GitHub.
2. Repo → **Settings → Pages → Source: GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site appears at
   `https://<user>.github.io/<repo>/`.

## Usage

1. **Import** — export CSVs from Etsy Shop Manager (paths are listed on the Import page)
   and pick them: Sold Orders, Sold Order Items, Payment Account statement. The app
   detects the type. Import the same file twice — row counts show *New / Updated /
   Skipped*, never duplicates.
2. **Dashboard** — pick a date range (this month, last month, last 30 days, this year,
   custom). Charts have a table-view toggle.
3. **Costing** — hit *Discover products from orders*, then fill in material / plating /
   packaging / labour per product. Profit per order and per product updates everywhere.
4. **Expenses** — add your off-Etsy costs (materials, packaging, labels, ads, tools,
   photography). Attach receipt photos; mark recurring items.
5. **Reports** — choose a report + date range, then Download PDF or CSV.
6. **Settings** — set shop name/address/logo for PDF headers, currencies, a PIN, and
   export a JSON backup regularly.

## Architecture

```
src/
  db/         Dexie schema + typed models (Order, OrderItem, Payment, Expense, Product, Settings)
  import/     CSV type detection, row parsing, chunked DataSource, dedupe/persist pipeline
  utils/      pure calculation core (calc, money, dates) — unit-tested, no DOM
  reports/    report builders + jsPDF/autotable and PapaParse exporters
  components/ layout (AppShell, bottom nav), charts, ui primitives
  pages/      Dashboard, Orders, OrderDetail, Reports, Expenses, Costing, Import, Settings
  hooks/      useTheme, usePinLock, useSettings
```

The import pipeline reads through a `DataSource` interface (CSV today, Etsy API v3
later) and always runs the same detect → parse → dedupe path, so a future API sync
plugs straight in.

## Privacy

- No backend, no analytics, no network calls. Data lives in IndexedDB on your device.
- PIN lock stores only a salted SHA-256 hash (it guards against casual snooping, not an
  attacker with full device access).
- Backups are JSON files you download yourself.
