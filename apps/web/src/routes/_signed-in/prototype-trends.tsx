// PROTOTYPE, throwaway: not for main.
//
// Question: what should the Trends charts look like? Three structurally
// different variants on /prototype-trends, switchable with ?variant=A|B|C
// (or ← → keys / the floating bar):
//   A · Columns: Income and Expenses as paired columns per month.
//   B · Lines: two lines with the gap between them shaded, Net as headline.
//   C · Net first: Net per month as columns above and below zero, then a table.
// ?category=<id> shows one Category over time (Budget per month for Expense
// Categories). ?data=demo swaps in 12 made-up months, since real data only
// goes back to October. Real data comes from the existing Dashboard and
// Transactions endpoints, one request per month: no new API.
// No tests, no polish, no error handling beyond what keeps it running.
import {
  addMonths,
  type CalendarMonth,
  type CategoryKind,
  type CurrencyCode,
  decimalPlacesOf,
  firstDayOf,
  formatAmount,
  isCalendarMonth,
  monthOf,
} from '@for-wealth/shared'
import { useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { z } from 'zod'
import { PageTitle } from '@/components/page-title'
import { EmptyPanel, PageHeading, Panel, PanelTitle } from '@/components/panel'
import { PrototypeSwitcher } from '@/components/prototype-switcher'
import { Button } from '@/components/ui/button'
import { useToday } from '@/hooks/use-today'
import { categoriesQuery } from '@/lib/categories'
import { dashboardQuery } from '@/lib/dashboard'
import { periodQuery } from '@/lib/transactions'
import { cn } from '@/lib/utils'

const VARIANTS = [
  { key: 'A', name: 'Columns' },
  { key: 'B', name: 'Lines' },
  { key: 'C', name: 'Net first' },
] as const
type VariantKey = (typeof VARIANTS)[number]['key']

const searchSchema = z.object({
  to: z.string().refine(isCalendarMonth).optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
  variant: z.enum(['A', 'B', 'C']).optional().catch(undefined),
  data: z.enum(['demo']).optional().catch(undefined),
})

export const Route = createFileRoute('/_signed-in/prototype-trends')({
  validateSearch: searchSchema,
  component: TrendsPrototype,
})

// ---------------------------------------------------------------- data

interface Point {
  month: CalendarMonth
  income: number
  expense: number
  // The picked Category's total for the month (0 with no Category).
  amount: number
  budget: number | null
  soFar: boolean
}

interface PickedCategory {
  id: string
  name: string
  kind: CategoryKind
}

interface ChartProps {
  points: Point[]
  category: PickedCategory | null
  currency: CurrencyCode
  open: (month: CalendarMonth) => void
}

function windowMonths(to: CalendarMonth): CalendarMonth[] {
  return Array.from({ length: 12 }, (_, i) => monthOf(addMonths(firstDayOf(to), i - 11)))
}

// A stable 0..1 number per month, so demo data doesn't jump on re-render.
function noise(month: string, salt: number) {
  let h = salt
  for (const c of month) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0
  return (Math.imul(h ^ (h >>> 15), 2654435761) >>> 0) / 2 ** 32
}

function demoPoints(months: CalendarMonth[], thisMonth: CalendarMonth, dayFraction: number, category: PickedCategory | null) {
  return months.map((month): Point => {
    const soFar = month === thisMonth
    const r1 = noise(month, 1)
    const r2 = noise(month, 2)
    // Salary lands on the 25th, so this month has none of it yet.
    const salary = soFar && dayFraction < 0.8 ? 0 : 550000
    const income = salary + (month.endsWith('-12') ? 300000 : 0) + (r1 < 0.35 ? Math.round(r1 * 120000) : 0)
    const expense = Math.round((380000 + r2 * 220000) * (soFar ? dayFraction : 1))
    let amount = 0
    let budget: number | null = null
    if (category?.kind === 'expense') {
      amount = Math.round((68000 + r2 * 45000) * (soFar ? dayFraction : 1))
      budget = month < '2026-06' ? 90000 : 100000
    } else if (category) {
      amount = salary
    }
    return { month, income, expense, amount, budget, soFar }
  })
}

function useSeries(to: CalendarMonth, thisMonth: CalendarMonth, today: string, category: PickedCategory | null, demo: boolean) {
  const months = windowMonths(to)
  const overall = useQueries({ queries: months.map((m) => ({ ...dashboardQuery(m), enabled: !demo })) })
  const perCategory = useQueries({
    queries: months.map((m) => ({
      ...periodQuery({ period: 'month', date: firstDayOf(m), category: category?.id }),
      enabled: !demo && category !== null,
    })),
  })

  if (demo) {
    const day = Number(today.slice(8, 10))
    return { points: demoPoints(months, thisMonth, day / 30, category), trimmed: false, loading: false }
  }
  const loading = overall.some((q) => q.isPending) || (category !== null && perCategory.some((q) => q.isPending))
  if (loading) return { points: [], trimmed: false, loading: true }

  const points = months.map((month, i): Point => {
    const totals = overall[i]?.data?.totals ?? { income: 0, expense: 0 }
    const listing = perCategory[i]?.data
    return {
      month,
      income: totals.income,
      expense: totals.expense,
      amount: category && listing ? listing.totals[category.kind] : 0,
      budget: category && listing ? listing.budget : null,
      soFar: month === thisMonth,
    }
  })
  // Months before the first Transaction are left out (decided in grilling).
  const first = points.findIndex((p) => p.income > 0 || p.expense > 0)
  if (first === -1) return { points: [], trimmed: true, loading: false }
  return { points: points.slice(first), trimmed: first > 0, loading: false }
}

// ---------------------------------------------------------------- formatting

const shortMonth = new Intl.DateTimeFormat('en-MY', { month: 'short', timeZone: 'UTC' })
const longMonth = new Intl.DateTimeFormat('en-MY', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthDate = (m: CalendarMonth) => new Date(`${m}-01T00:00:00Z`)
const short = (m: CalendarMonth) => shortMonth.format(monthDate(m))
const long = (m: CalendarMonth) => longMonth.format(monthDate(m))

function signed(n: number, currency: CurrencyCode) {
  return n < 0 ? `−${formatAmount(-n, currency)}` : `+${formatAmount(n, currency)}`
}

// Axis labels: whole thousands of the currency, e.g. "6k".
function axisLabel(n: number, currency: CurrencyCode) {
  const whole = n / 10 ** decimalPlacesOf(currency)
  return whole >= 1000 ? `${Math.round(whole / 100) / 10}k` : `${Math.round(whole)}`
}

// A round number at or above v, so gridlines land on tidy values.
function niceMax(v: number) {
  if (v <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(v))
  return Math.ceil((v / step) * 2) / 2 * step
}

const pct = (v: number, max: number) => `${Math.max(0, (v / max) * 100)}%`

// ---------------------------------------------------------------- page

function TrendsPrototype() {
  const { me } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const today = useToday(me.timeZone)
  const thisMonth = monthOf(today)
  const to = search.to && search.to <= thisMonth ? search.to : thisMonth
  const variant: VariantKey = search.variant ?? 'A'
  const demo = search.data === 'demo'

  const categories = useQuery(categoriesQuery)
  const all: PickedCategory[] = categories.data
    ? [
        ...categories.data.expense.map((c) => ({ ...c, kind: 'expense' as const })),
        ...categories.data.income.map((c) => ({ ...c, kind: 'income' as const })),
        ...categories.data.archived.expense.map((c) => ({ ...c, name: `${c.name} (archived)`, kind: 'expense' as const })),
        ...categories.data.archived.income.map((c) => ({ ...c, name: `${c.name} (archived)`, kind: 'income' as const })),
      ]
    : []
  const category = all.find((c) => c.id === search.category) ?? null

  const series = useSeries(to, thisMonth, today, category, demo)
  const earlier = monthOf(addMonths(firstDayOf(to), -12))
  const later = monthOf(addMonths(firstDayOf(to), 12))
  const canGoBack = !series.trimmed && earlier >= '2000-01'
  const canGoForward = to < thisMonth

  const open = (month: CalendarMonth) => {
    if (category) {
      void navigate({ to: '/transactions', search: { period: 'month', date: firstDayOf(month), category: category.id } })
    } else {
      void navigate({ to: '/', search: { month } })
    }
  }

  const first = series.points[0]
  const last = series.points.at(-1)
  const props: ChartProps = { points: series.points, category, currency: me.currency, open }

  return (
    <main className="flex flex-col gap-5 pt-4 pb-8 sm:gap-6 sm:pt-6 sm:pb-12">
      <PageTitle>Trends</PageTitle>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <PageHeading>Trends</PageHeading>
          <nav aria-label="Years" className="flex items-center gap-3">
            <div className="flex">
              <StepButton
                direction={-1}
                disabled={!canGoBack}
                onClick={() => void navigate({ search: (prev) => ({ ...prev, to: earlier }) })}
              />
              <StepButton
                direction={1}
                disabled={!canGoForward}
                onClick={() =>
                  void navigate({ search: (prev) => ({ ...prev, to: later >= thisMonth ? undefined : later }) })
                }
              />
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">
              {first && last ? `${long(first.month)} – ${long(last.month)}` : ''}
            </span>
          </nav>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Category</span>
          <select
            value={category?.id ?? ''}
            onChange={(e) =>
              void navigate({ search: (prev) => ({ ...prev, category: e.target.value || undefined }) })
            }
            className="h-9 rounded-full border border-input bg-card px-3 text-sm"
          >
            <option value="">All Categories</option>
            {all.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.kind === 'income' ? 'Income' : 'Expense'})
              </option>
            ))}
          </select>
        </label>
      </div>

      {series.loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!series.loading && series.points.length === 0 && (
        <EmptyPanel>
          <p className="text-muted-foreground">Nothing recorded yet. Your months show here once you add Transactions.</p>
        </EmptyPanel>
      )}
      {!series.loading && series.points.length > 0 && (
        <>
          {variant === 'A' && <VariantA {...props} />}
          {variant === 'B' && <VariantB {...props} />}
          {variant === 'C' && <VariantC {...props} />}
        </>
      )}

      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(key) => void navigate({ search: (prev) => ({ ...prev, variant: key }) })}
      >
        <button
          type="button"
          onClick={() => void navigate({ search: (prev) => ({ ...prev, data: demo ? undefined : 'demo' }) })}
          className="rounded-full bg-background/15 px-3 py-1.5 text-xs font-medium whitespace-nowrap hover:bg-background/25"
        >
          {demo ? 'Demo data' : 'Real data'}
        </button>
      </PrototypeSwitcher>
    </main>
  )
}

function StepButton({ direction, disabled, onClick }: { direction: -1 | 1; disabled: boolean; onClick: () => void }) {
  const Icon = direction === -1 ? ChevronLeftIcon : ChevronRightIcon
  return (
    <Button
      variant="outline"
      size="icon"
      disabled={disabled}
      onClick={onClick}
      aria-label={direction === -1 ? 'Previous 12 months' : 'Next 12 months'}
      className={direction === -1 ? 'rounded-r-none' : '-ml-px rounded-l-none'}
    >
      <Icon />
    </Button>
  )
}

// ---------------------------------------------------------------- shared bits

function Figure({ label, value, detail }: { label: string; value: string; detail?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
      {detail && <dd className="text-sm text-muted-foreground">{detail}</dd>}
    </div>
  )
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span aria-hidden="true" className={cn('inline-block size-2.5 rounded-sm', className)} />
      {label}
    </span>
  )
}

function Tooltip({ at, count, children }: { at: number; count: number; children: ReactNode }) {
  // Keep it inside the plot at either end.
  const left = ((at + 0.5) / count) * 100
  const shift = left < 20 ? '0%' : left > 80 ? '-100%' : '-50%'
  return (
    <div
      className="pointer-events-none absolute -top-2 z-10 min-w-44 rounded-xl bg-popover p-3 text-sm text-popover-foreground shadow-float"
      style={{ left: `${left}%`, transform: `translate(${shift}, -100%)` }}
    >
      {children}
    </div>
  )
}

function Row({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {swatch && <span aria-hidden="true" className={cn('inline-block size-2 rounded-sm', swatch)} />}
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

function MonthLabels({ points }: { points: Point[] }) {
  return (
    <div className="flex">
      {points.map((p) => (
        <div key={p.month} className="flex flex-1 flex-col items-center text-xs text-muted-foreground">
          <span>{short(p.month)}</span>
          {p.soFar && <span className="text-[10px] leading-tight">so far</span>}
        </div>
      ))}
    </div>
  )
}

function Gridlines({ max, currency }: { max: number; currency: CurrencyCode }) {
  return (
    <>
      {[0, 0.5, 1].map((f) => (
        <div key={f} className="absolute inset-x-0 border-t border-border" style={{ bottom: `${f * 100}%` }}>
          <span className="absolute -top-2 -left-10 w-8 text-right text-[11px] text-muted-foreground tabular-nums">
            {axisLabel(max * f, currency)}
          </span>
        </div>
      ))}
    </>
  )
}

const isOver = (p: Point) => p.budget !== null && p.amount > p.budget

// ---------------------------------------------------------------- A · Columns

function VariantA({ points, category, currency, open }: ChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const sum = (f: (p: Point) => number) => points.reduce((s, p) => s + f(p), 0)
  const hovered = hover === null ? undefined : points[hover]

  if (category) {
    const max = niceMax(Math.max(...points.map((p) => Math.max(p.amount, p.budget ?? 0))))
    const budgeted = points.filter((p) => p.budget !== null && !p.soFar)
    return (
      <>
        <dl className="grid grid-cols-2 gap-6 rounded-2xl bg-card p-5 shadow-panel sm:grid-cols-3 sm:p-6">
          <Figure label={`${category.name}, ${points.length} months`} value={formatAmount(sum((p) => p.amount), currency)} />
          <Figure label="Average a month" value={formatAmount(Math.round(sum((p) => p.amount) / points.length), currency)} />
          {category.kind === 'expense' && (
            <Figure
              label="Months Overspent"
              value={`${budgeted.filter(isOver).length} of ${budgeted.length}`}
              detail="Months with a Budget, this month left out"
            />
          )}
        </dl>
        <Panel aria-labelledby="chart" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PanelTitle id="chart">{category.name} by month</PanelTitle>
            {category.kind === 'expense' && (
              <div className="flex gap-4">
                <Swatch className="bg-primary" label="Within Budget" />
                <Swatch className="bg-over-budget" label="Overspent" />
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span aria-hidden="true" className="inline-block w-4 border-t-2 border-dashed border-foreground" />
                  Budget
                </span>
              </div>
            )}
          </div>
          <div className="relative mt-6 ml-10 h-56 sm:h-64">
            <Gridlines max={max} currency={currency} />
            <div className="absolute inset-0 flex">
              {points.map((p, i) => (
                <button
                  type="button"
                  key={p.month}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => open(p.month)}
                  aria-label={`${long(p.month)}: ${formatAmount(p.amount, currency)}`}
                  className="relative flex h-full flex-1 items-end justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span
                    className={cn('w-3 rounded-t-[4px] sm:w-6', isOver(p) ? 'bg-over-budget' : 'bg-primary', p.soFar && 'opacity-50')}
                    style={{ height: pct(p.amount, max) }}
                  />
                  {p.budget !== null && (
                    <span
                      className="absolute inset-x-0.5 border-t-2 border-dashed border-foreground"
                      style={{ bottom: pct(p.budget, max) }}
                    />
                  )}
                </button>
              ))}
            </div>
            {hovered && hover !== null && (
              <Tooltip at={hover} count={points.length}>
                <p className="mb-1.5 font-medium">{long(hovered.month)}{hovered.soFar && ' (so far)'}</p>
                <Row label={category.name} value={formatAmount(hovered.amount, currency)} />
                {hovered.budget !== null && <Row label="Budget" value={formatAmount(hovered.budget, currency)} />}
                {hovered.budget !== null && (
                  <p className={cn('mt-1', isOver(hovered) ? 'text-over-budget' : 'text-muted-foreground')}>
                    {isOver(hovered)
                      ? `Overspent by ${formatAmount(hovered.amount - hovered.budget, currency)}`
                      : `${formatAmount(hovered.budget - hovered.amount, currency)} left`}
                  </p>
                )}
              </Tooltip>
            )}
          </div>
          <div className="ml-10">
            <MonthLabels points={points} />
          </div>
        </Panel>
      </>
    )
  }

  const income = sum((p) => p.income)
  const expense = sum((p) => p.expense)
  const max = niceMax(Math.max(...points.map((p) => Math.max(p.income, p.expense))))
  return (
    <>
      <dl className="grid grid-cols-2 gap-6 rounded-2xl bg-card p-5 shadow-panel sm:grid-cols-3 sm:p-6">
        <Figure label={`Income, ${points.length} months`} value={formatAmount(income, currency)} />
        <Figure label={`Expenses, ${points.length} months`} value={formatAmount(expense, currency)} />
        <Figure label="Net" value={signed(income - expense, currency)} />
      </dl>
      <Panel aria-labelledby="chart" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PanelTitle id="chart">Income and Expenses by month</PanelTitle>
          <div className="flex gap-4">
            <Swatch className="bg-primary" label="Income" />
            <Swatch className="bg-muted-foreground" label="Expenses" />
          </div>
        </div>
        <div className="relative mt-6 ml-10 h-56 sm:h-64">
          <Gridlines max={max} currency={currency} />
          <div className="absolute inset-0 flex">
            {points.map((p, i) => (
              <button
                type="button"
                key={p.month}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => open(p.month)}
                aria-label={`${long(p.month)}: Income ${formatAmount(p.income, currency)}, Expenses ${formatAmount(p.expense, currency)}`}
                className="flex h-full flex-1 items-end justify-center gap-0.5 rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  className={cn('w-2 rounded-t-[4px] bg-primary sm:w-3.5', p.soFar && 'opacity-50')}
                  style={{ height: pct(p.income, max) }}
                />
                <span
                  className={cn('w-2 rounded-t-[4px] bg-muted-foreground sm:w-3.5', p.soFar && 'opacity-50')}
                  style={{ height: pct(p.expense, max) }}
                />
              </button>
            ))}
          </div>
          {hovered && hover !== null && (
            <Tooltip at={hover} count={points.length}>
              <p className="mb-1.5 font-medium">{long(hovered.month)}{hovered.soFar && ' (so far)'}</p>
              <Row label="Income" swatch="bg-primary" value={formatAmount(hovered.income, currency)} />
              <Row label="Expenses" swatch="bg-muted-foreground" value={formatAmount(hovered.expense, currency)} />
              <div className="mt-1.5 border-t border-border pt-1.5">
                <Row label="Net" value={signed(hovered.income - hovered.expense, currency)} />
              </div>
            </Tooltip>
          )}
        </div>
        <div className="ml-10">
          <MonthLabels points={points} />
        </div>
      </Panel>
    </>
  )
}

// ---------------------------------------------------------------- B · Lines

function VariantB({ points, category, currency, open }: ChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const n = points.length
  const x = (i: number) => ((i + 0.5) / n) * 100
  const hovered = hover === null ? undefined : points[hover]

  const values = category
    ? points.flatMap((p) => [p.amount, p.budget ?? 0])
    : points.flatMap((p) => [p.income, p.expense])
  const max = niceMax(Math.max(...values))
  const y = (v: number) => 100 - (v / max) * 100
  const line = (f: (p: Point) => number) => points.map((p, i) => `${x(i)},${y(f(p))}`).join(' ')

  const income = points.reduce((s, p) => s + p.income, 0)
  const expense = points.reduce((s, p) => s + p.expense, 0)
  const total = points.reduce((s, p) => s + p.amount, 0)

  // The Budget as a step: flat across each month, jumping where it changed.
  const budgetPath = category
    ? points
        .map((p, i) =>
          p.budget === null ? '' : `M${(i / n) * 100},${y(p.budget)} H${((i + 1) / n) * 100}`,
        )
        .join(' ')
    : ''

  return (
    <Panel aria-labelledby="chart" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <PanelTitle id="chart" className="text-sm font-medium text-muted-foreground">
            {category ? `${category.name} over ${n} months` : `Net over ${n} months`}
          </PanelTitle>
          <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
            {category ? formatAmount(total, currency) : signed(income - expense, currency)}
          </p>
          {!category && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatAmount(income, currency)} in · {formatAmount(expense, currency)} out
            </p>
          )}
        </div>
        <div className="flex gap-4">
          {category ? (
            <>
              <Swatch className="bg-primary" label={category.name} />
              {category.kind === 'expense' && <Swatch className="bg-over-budget" label="Overspent" />}
            </>
          ) : (
            <>
              <Swatch className="bg-primary" label="Income" />
              <Swatch className="bg-muted-foreground" label="Expenses" />
            </>
          )}
        </div>
      </div>

      <div className="relative ml-10 h-56 sm:h-72">
        <Gridlines max={max} currency={currency} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          {!category && (
            <polygon
              points={`${line((p) => p.income)} ${points
                .map((p, i) => `${x(i)},${y(p.expense)}`)
                .reverse()
                .join(' ')}`}
              className="fill-primary opacity-10"
            />
          )}
          {category && category.kind === 'expense' && (
            <path d={budgetPath} className="fill-none stroke-foreground" strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          )}
          {category ? (
            <polyline points={line((p) => p.amount)} className="fill-none stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          ) : (
            <>
              <polyline points={line((p) => p.income)} className="fill-none stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <polyline points={line((p) => p.expense)} className="fill-none stroke-muted-foreground" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        {/* Round dots in HTML, so the stretched SVG can't squash them. */}
        {points.map((p, i) =>
          (category ? [{ v: p.amount, c: isOver(p) ? 'bg-over-budget' : 'bg-primary' }] : [
            { v: p.income, c: 'bg-primary' },
            { v: p.expense, c: 'bg-muted-foreground' },
          ]).map(({ v, c }, k) => (
            <span
              key={`${p.month}-${k}`}
              className={cn('absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-card', c, hover === i && 'size-3.5')}
              style={{ left: `${x(i)}%`, bottom: pct(v, max) }}
            />
          )),
        )}
        {hover !== null && (
          <span className="pointer-events-none absolute inset-y-0 border-l border-foreground/40" style={{ left: `${x(hover)}%` }} />
        )}
        <div className="absolute inset-0 flex">
          {points.map((p, i) => (
            <button
              type="button"
              key={p.month}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => open(p.month)}
              aria-label={long(p.month)}
              className="h-full flex-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          ))}
        </div>
        {hovered && hover !== null && (
          <Tooltip at={hover} count={n}>
            <p className="mb-1.5 font-medium">{long(hovered.month)}{hovered.soFar && ' (so far)'}</p>
            {category ? (
              <>
                <Row label={category.name} value={formatAmount(hovered.amount, currency)} />
                {hovered.budget !== null && <Row label="Budget" value={formatAmount(hovered.budget, currency)} />}
              </>
            ) : (
              <>
                <Row label="Income" swatch="bg-primary" value={formatAmount(hovered.income, currency)} />
                <Row label="Expenses" swatch="bg-muted-foreground" value={formatAmount(hovered.expense, currency)} />
                <div className="mt-1.5 border-t border-border pt-1.5">
                  <Row label="Net" value={signed(hovered.income - hovered.expense, currency)} />
                </div>
              </>
            )}
          </Tooltip>
        )}
      </div>
      <div className="ml-10">
        <MonthLabels points={points} />
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------- C · Net first

function VariantC({ points, category, currency, open }: ChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const budgeted = category?.kind === 'expense' && points.some((p) => p.budget !== null)

  // The diverging value: Net with no Category; what's left of the Budget for
  // a budgeted Expense Category; otherwise the plain amount.
  const value = (p: Point) =>
    !category ? p.income - p.expense : budgeted ? (p.budget === null ? 0 : p.budget - p.amount) : p.amount
  const values = points.map(value)
  const up = Math.max(0, ...values)
  const down = Math.max(0, ...values.map((v) => -v))
  const span = up + down || 1
  const zero = (down / span) * 100
  const net = values.reduce((s, v) => s + v, 0)
  const positive = values.filter((v) => v > 0).length
  const newestFirst = [...points].reverse()
  const hovered = hover === null ? undefined : points[hover]

  const upColour = !category ? 'bg-primary' : budgeted ? 'bg-under-budget' : 'bg-primary'
  const downColour = !category ? 'bg-foreground' : 'bg-over-budget'

  return (
    <>
      <Panel aria-labelledby="chart" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <PanelTitle id="chart" className="text-sm font-medium text-muted-foreground">
            {!category
              ? `Net, ${points.length} months`
              : budgeted
                ? `${category.name} against its Budget`
                : `${category.name}, ${points.length} months`}
          </PanelTitle>
          <p className="text-4xl font-semibold tracking-tight tabular-nums">
            {!category ? signed(net, currency) : budgeted ? signed(net, currency) : formatAmount(net, currency)}
          </p>
          <p className="text-sm text-muted-foreground">
            {!category
              ? `More in than out in ${positive} of ${points.length} months`
              : budgeted
                ? `Within Budget in ${positive} of ${points.length} months · ${signed(net, currency)} left over the period`
                : 'Total over the period'}
          </p>
        </div>
        <div className="relative h-40">
          <div className="absolute inset-x-0 border-t border-foreground/40" style={{ bottom: `${zero}%` }} />
          <div className="absolute inset-0 flex">
            {points.map((p, i) => {
              const v = values[i] ?? 0
              const h = (Math.abs(v) / span) * 100
              return (
                <button
                  type="button"
                  key={p.month}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => open(p.month)}
                  aria-label={`${long(p.month)}: ${signed(v, currency)}`}
                  className="relative h-full flex-1 rounded-md hover:bg-muted"
                >
                  <span
                    className={cn(
                      'absolute left-1/2 w-3 -translate-x-1/2 sm:w-6',
                      v >= 0 ? cn(upColour, 'rounded-t-[4px]') : cn(downColour, 'rounded-b-[4px]'),
                      p.soFar && 'opacity-50',
                    )}
                    style={v >= 0 ? { bottom: `${zero}%`, height: `${h}%` } : { bottom: `${zero - h}%`, height: `${h}%` }}
                  />
                </button>
              )
            })}
          </div>
          {hovered && hover !== null && (
            <Tooltip at={hover} count={points.length}>
              <p className="font-medium">{long(hovered.month)}</p>
              <p className="tabular-nums">{signed(values[hover] ?? 0, currency)}</p>
            </Tooltip>
          )}
        </div>
        <MonthLabels points={points} />
      </Panel>

      <Panel aria-labelledby="months" className="flex flex-col gap-2">
        <PanelTitle id="months">Month by month</PanelTitle>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 font-normal">Month</th>
              {category ? (
                <>
                  <th className="py-2 text-right font-normal">{category.kind === 'income' ? 'Received' : 'Spent'}</th>
                  {budgeted && <th className="hidden py-2 text-right font-normal sm:table-cell">Budget</th>}
                  {budgeted && <th className="py-2 text-right font-normal">Standing</th>}
                </>
              ) : (
                <>
                  <th className="hidden py-2 text-right font-normal sm:table-cell">Income</th>
                  <th className="hidden py-2 text-right font-normal sm:table-cell">Expenses</th>
                  <th className="py-2 text-right font-normal">Net</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {newestFirst.map((p) => (
              <tr key={p.month} className="hover:bg-muted">
                <td className="py-3">
                  {category ? (
                    <Link
                      to="/transactions"
                      search={{ period: 'month', date: firstDayOf(p.month), category: category.id }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {long(p.month)}
                    </Link>
                  ) : (
                    <Link to="/" search={{ month: p.month }} className="font-medium underline-offset-4 hover:underline">
                      {long(p.month)}
                    </Link>
                  )}
                  {p.soFar && <span className="ml-2 text-xs text-muted-foreground">so far</span>}
                </td>
                {category ? (
                  <>
                    <td className="py-3 text-right">{formatAmount(p.amount, currency)}</td>
                    {budgeted && (
                      <td className="hidden py-3 text-right text-muted-foreground sm:table-cell">
                        {p.budget === null ? '–' : formatAmount(p.budget, currency)}
                      </td>
                    )}
                    {budgeted && (
                      <td className={cn('py-3 text-right', isOver(p) ? 'text-over-budget' : 'text-muted-foreground')}>
                        {p.budget === null
                          ? '–'
                          : isOver(p)
                            ? `Over by ${formatAmount(p.amount - p.budget, currency)}`
                            : `${formatAmount(p.budget - p.amount, currency)} left`}
                      </td>
                    )}
                  </>
                ) : (
                  <>
                    <td className="hidden py-3 text-right sm:table-cell">{formatAmount(p.income, currency)}</td>
                    <td className="hidden py-3 text-right sm:table-cell">{formatAmount(p.expense, currency)}</td>
                    <td className="py-3 text-right font-medium">{signed(p.income - p.expense, currency)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
