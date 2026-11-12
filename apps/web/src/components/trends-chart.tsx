import {
  budgetProgress,
  type CalendarMonth,
  type CurrencyCode,
  firstDayOf,
  formatAmount,
  formatNet,
  formatPeriodLabel,
  trendsScale,
  utcMidnight,
} from '@for-wealth/shared'
import { Link, linkOptions } from '@tanstack/react-router'
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Panel, PanelTitle } from '@/components/panel'
import type { CategoryTrends, TrendsMonth } from '@/lib/trends'
import { cn } from '@/lib/utils'

// Read and formatted in UTC, like the other month labels, so the device's
// zone can't move a month.
const shortMonth = new Intl.DateTimeFormat('en-MY', { month: 'short', timeZone: 'UTC' })

const longMonth = (month: CalendarMonth) => formatPeriodLabel('month', firstDayOf(month))

// Where a month opens: its Dashboard, or the Transactions page on that Month
// filtered to one Category.
const dashboardLink = (month: CalendarMonth) => linkOptions({ to: '/', search: { month } })
const categoryLink = (month: CalendarMonth, category: string) =>
  linkOptions({ to: '/transactions', search: { period: 'month', date: firstDayOf(month), category } })

// A month on the chart: its columns, left to right, an optional Budget mark,
// where it opens, the name its link reads out and the figures shown over it.
interface ChartMonth {
  month: CalendarMonth
  columns: { amount: number; className: string }[]
  budget: number | null
  link: ReturnType<typeof dashboardLink> | ReturnType<typeof categoryLink>
  name: string
  figures: ReactNode
}

// A column's or a mark's height: its share of the axis. A column that isn't
// zero is at least 2px, so a small amount still shows.
const axisShare = (amount: number, top: number) => `${(amount / top) * 100}%`
const columnHeight = (amount: number, top: number) => (amount > 0 ? `max(2px, ${axisShare(amount, top)})` : '0')

// Each month's Income and Expenses as a pair of columns, oldest on the left.
// Each month opens its Dashboard. Net is in the figures, never a colour.
export function TrendsChart({
  months,
  currency,
  thisMonth,
}: {
  months: readonly TrendsMonth[]
  currency: CurrencyCode
  thisMonth: CalendarMonth
}) {
  return (
    <MonthsChart
      id="income-and-expenses"
      title="Income and Expenses by month"
      legend={
        <>
          <Swatch className="bg-chart-income" label="Income" />
          <Swatch className="bg-chart-expense" label="Expenses" />
        </>
      }
      currency={currency}
      thisMonth={thisMonth}
      months={months.map(({ month, income, expense }) => {
        const soFar = month === thisMonth
        return {
          month,
          columns: [
            { amount: income, className: 'w-2 bg-chart-income sm:w-3.5' },
            { amount: expense, className: 'w-2 bg-chart-expense sm:w-3.5' },
          ],
          budget: null,
          link: dashboardLink(month),
          name: `${longMonth(month)}${soFar ? ' so far' : ''}: Income ${formatAmount(income, currency)}, Expenses ${formatAmount(expense, currency)}, Net ${formatNet(income - expense, currency)}`,
          figures: (
            <>
              <FigureRow label="Income" swatch="bg-chart-income" value={formatAmount(income, currency)} />
              <FigureRow label="Expenses" swatch="bg-chart-expense" value={formatAmount(expense, currency)} />
              <div className="mt-0.5 border-t pt-1.5">
                <FigureRow label="Net" value={formatNet(income - expense, currency)} />
              </div>
            </>
          ),
        }
      })}
    />
  )
}

// One Category's total as a column each month, in its kind's colour. An
// Expense Category's Budget limit for the month is a dashed ink mark across
// it, and a month over it is drawn in the over-Budget red: the only red, and
// nothing is green (v1-spec "Trends"). Each month opens the Transactions page
// on that Month, filtered to the Category.
export function CategoryTrendsChart({
  trends: { category, months },
  currency,
  thisMonth,
}: {
  trends: CategoryTrends
  currency: CurrencyCode
  thisMonth: CalendarMonth
}) {
  const colour = category.kind === 'expense' ? 'bg-chart-expense' : 'bg-chart-income'
  // Only an Expense Category has a Budget; the API sends none for Income.
  const budgeted = months.some((m) => m.budget !== null)

  return (
    <MonthsChart
      id="category-by-month"
      title={`${category.name} by month`}
      legend={
        <>
          <Swatch className={colour} label={category.name} />
          {budgeted && (
            <>
              <Swatch className="bg-over-budget" label="Overspent" />
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="w-3.5 border-t-2 border-dashed border-foreground" />
                Budget
              </li>
            </>
          )}
        </>
      }
      currency={currency}
      thisMonth={thisMonth}
      months={months.map(({ month, total, budget }) => {
        const soFar = month === thisMonth
        // Counted as the Dashboard's Budgets are (v1-spec "Budgets").
        const progress = budget === null ? null : budgetProgress(total, budget)
        const over = progress?.overspent ?? false
        const standing =
          progress === null
            ? null
            : progress.overspent
              ? `Overspent by ${formatAmount(progress.by, currency)}`
              : `${formatAmount(progress.left, currency)} left`
        return {
          month,
          columns: [{ amount: total, className: cn('w-3 sm:w-6', over ? 'bg-over-budget' : colour) }],
          budget,
          link: categoryLink(month, category.id),
          name: [
            `${longMonth(month)}${soFar ? ' so far' : ''}: ${category.name} ${formatAmount(total, currency)}`,
            ...(budget === null ? [] : [`Budget ${formatAmount(budget, currency)}`, standing]),
          ].join(', '),
          figures: (
            <>
              <FigureRow label={category.name} swatch={over ? 'bg-over-budget' : colour} value={formatAmount(total, currency)} />
              {budget !== null && (
                <>
                  <FigureRow label="Budget" value={formatAmount(budget, currency)} />
                  <p
                    className={cn(
                      'mt-0.5 border-t pt-1.5 font-medium tabular-nums',
                      over ? 'text-over-budget' : 'text-muted-foreground',
                    )}
                  >
                    {standing}
                  </p>
                </>
              )}
            </>
          ),
        }
      })}
    />
  )
}

// Which month's figures show. Hovering with a mouse or pen, or focusing,
// shows them while it lasts; a tap pins them, with a link to open the month.
type Active = { index: number; pinned: boolean }

// A row of months, oldest on the left, each a link holding its columns, drawn
// as plain elements in the theme's tokens: no chart library (v1-spec
// "Trends"). The axis is tidy and reaches the tallest column or Budget mark.
// This month is still filling, so it says "so far" and is drawn lighter.
function MonthsChart({
  id,
  title,
  legend,
  months,
  currency,
  thisMonth,
}: {
  id: string
  title: string
  // The columns' colours named, so they're never the only clue.
  legend: ReactNode
  months: readonly ChartMonth[]
  currency: CurrencyCode
  thisMonth: CalendarMonth
}) {
  const { top, ticks } = trendsScale(
    Math.max(...months.flatMap((m) => [...m.columns.map((c) => c.amount), m.budget ?? 0])),
    currency,
  )
  const [active, setActive] = useState<Active | null>(null)
  // How the last press on a month began, so a click can tell a tap.
  const pressedBy = useRef<string>('')
  const chart = useRef<HTMLDivElement>(null)
  const shown = active && months[active.index]
  const show = (index: number) => setActive({ index, pinned: false })
  // Pinned figures stay until another month is shown or they're put away.
  const hide = () => setActive((a) => (a?.pinned ? a : null))

  // A tap anywhere outside the chart puts the pinned figures away.
  const pinned = active?.pinned ?? false
  useEffect(() => {
    if (!pinned) return
    const away = (event: PointerEvent) => {
      if (!chart.current?.contains(event.target as Node)) setActive(null)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [pinned])

  // On a touch screen the first tap shows the month's figures and the second
  // opens it. A mouse, a pen and the keyboard (a click with no presses, as
  // `detail` counts them) open it straight away.
  const onClick = (index: number) => (event: MouseEvent) => {
    const tapped = pressedBy.current === 'touch' && event.detail > 0
    if (tapped && !(active?.pinned && active.index === index)) {
      event.preventDefault()
      setActive({ index, pinned: true })
    }
    pressedBy.current = ''
  }

  return (
    <Panel aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <PanelTitle id={id}>{title}</PanelTitle>
        <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {legend}
        </ul>
      </div>

      {/* Room on the left for the axis labels, and above for the figures. */}
      {/* Escape puts the figures away, pinned ones too. */}
      <div
        ref={chart}
        onKeyDown={(event) => event.key === 'Escape' && setActive(null)}
        className="relative mt-4 ml-9 sm:ml-10"
      >
        <div className="relative h-52 sm:h-64">
          {ticks.map(({ value, label }) => (
            <div
              key={value}
              aria-hidden="true"
              className={cn('absolute inset-x-0 border-t', value === 0 ? 'border-input' : 'border-border')}
              style={{ bottom: axisShare(value, top) }}
            >
              <span className="absolute right-full mr-2 -translate-y-1/2 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
                {label}
              </span>
            </div>
          ))}

          <ol aria-label="Months" className="absolute inset-0 flex">
            {months.map(({ month, columns, budget, link, name }, index) => {
              const soFar = month === thisMonth
              return (
                <li key={month} className="flex h-full min-w-0 flex-1">
                  <Link
                    {...link}
                    aria-label={name}
                    onPointerDown={(event) => (pressedBy.current = event.pointerType)}
                    onClick={onClick(index)}
                    // Pointer events, not mouse ones: a phone fires mouseover
                    // on a tap, and iOS then holds back the click as a hover.
                    onPointerEnter={(event) => event.pointerType !== 'touch' && show(index)}
                    onPointerLeave={(event) => event.pointerType !== 'touch' && hide()}
                    onFocus={() => show(index)}
                    onBlur={hide}
                    className={cn(
                      'relative flex h-full flex-1 items-end justify-center gap-0.5 rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                      active?.index === index && 'bg-muted',
                    )}
                  >
                    {columns.map((column, i) => (
                      <span
                        // A month's columns never change places.
                        key={i}
                        className={cn('rounded-t-[4px]', column.className, soFar && 'opacity-55')}
                        style={{ height: columnHeight(column.amount, top) }}
                      />
                    ))}
                    {budget !== null && (
                      // Across the month, a little in from its edges, so
                      // neighbouring months' marks don't run together.
                      <span
                        className="absolute inset-x-0.5 border-t-2 border-dashed border-foreground sm:inset-x-1.5"
                        style={{ bottom: axisShare(budget, top) }}
                      />
                    )}
                  </Link>
                </li>
              )
            })}
          </ol>

          {shown && active && (
            <MonthFigures
              shown={shown}
              soFar={shown.month === thisMonth}
              index={active.index}
              monthCount={months.length}
              pinned={active.pinned}
            />
          )}
        </div>

        {/* Under each month its short name; the year under the first month
            and each January; "so far" under this month. */}
        <div aria-hidden="true" className="mt-2 flex">
          {months.map(({ month }, index) => {
            const soFar = month === thisMonth
            const year = index === 0 || month.endsWith('-01') ? month.slice(0, 4) : null
            return (
              <div
                key={month}
                className="flex min-w-0 flex-1 flex-col items-center text-[11px] leading-tight whitespace-nowrap text-muted-foreground sm:text-xs"
              >
                <span className={cn(soFar && 'font-medium text-foreground')}>
                  {shortMonth.format(utcMidnight(firstDayOf(month)))}
                </span>
                {year && <span>{year}</span>}
                {soFar && <span>so far</span>}
              </div>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}

// A month's figures over the chart, above its columns and kept inside the
// plot at either end. A tap pins them, with a link to open the month, as the
// first tap doesn't. Otherwise they repeat the month's link name, so they're
// hidden from screen readers.
function MonthFigures({
  shown: { month, link, figures },
  soFar,
  index,
  monthCount,
  pinned,
}: {
  shown: ChartMonth
  soFar: boolean
  // The month's place among the months shown.
  index: number
  monthCount: number
  pinned: boolean
}) {
  const left = ((index + 0.5) / monthCount) * 100
  const shift = left < 25 ? '0%' : left > 75 ? '-100%' : '-50%'
  return (
    <div
      className={cn(
        'absolute -top-3 z-10 flex w-48 flex-col gap-1 rounded-xl bg-popover p-3 text-sm text-popover-foreground shadow-float',
        !pinned && 'pointer-events-none',
      )}
      style={{ left: `${left}%`, transform: `translate(${shift}, -100%)` }}
    >
      <div aria-hidden={!pinned} className="flex flex-col gap-1">
        <p className="font-medium">
          {longMonth(month)}
          {soFar && <span className="font-normal text-muted-foreground"> so far</span>}
        </p>
        {figures}
      </div>
      {pinned && (
        <Link
          {...link}
          className="-mx-1 mt-1 flex min-h-11 items-center rounded-md px-1 font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Open {longMonth(month)}
        </Link>
      )}
    </div>
  )
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex min-w-0 items-center gap-1.5">
      <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-xs', className)} />
      <span className="truncate">{label}</span>
    </li>
  )
}

function FigureRow({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        {swatch && <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-xs', swatch)} />}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
