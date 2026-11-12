import {
  type CalendarMonth,
  type CurrencyCode,
  firstDayOf,
  formatAmount,
  formatNet,
  formatPeriodLabel,
  trendsScale,
  utcMidnight,
} from '@for-wealth/shared'
import { Link } from '@tanstack/react-router'
import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { Panel, PanelTitle } from '@/components/panel'
import type { TrendsMonth } from '@/lib/trends'
import { cn } from '@/lib/utils'

// Read and formatted in UTC, like the other month labels, so the device's
// zone can't move a month.
const shortMonth = new Intl.DateTimeFormat('en-MY', { month: 'short', timeZone: 'UTC' })

const longMonth = (month: CalendarMonth) => formatPeriodLabel('month', firstDayOf(month))

// A column's height: its share of the axis, and at least 2px when it isn't
// zero, so a small amount still shows.
function columnHeight(amount: number, top: number) {
  return amount > 0 ? `max(2px, ${(amount / top) * 100}%)` : '0'
}

// Which month's figures show. Hovering with a mouse or pen, or focusing,
// shows them while it lasts; a tap pins them, with a link to open the month.
type Active = { index: number; pinned: boolean }

// Each month's Income and Expenses as a pair of columns, oldest on the left,
// drawn as plain elements in the theme's tokens: no chart library (v1-spec
// "Trends"). Each month is a link to its Dashboard whose name reads out its
// figures. This month is still filling, so it says "so far" and is drawn
// lighter.
export function TrendsChart({
  months,
  currency,
  thisMonth,
}: {
  months: readonly TrendsMonth[]
  currency: CurrencyCode
  thisMonth: CalendarMonth
}) {
  const { top, ticks } = trendsScale(Math.max(...months.map((m) => Math.max(m.income, m.expense))), currency)
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
    <Panel aria-labelledby="income-and-expenses" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <PanelTitle id="income-and-expenses">Income and Expenses by month</PanelTitle>
        {/* The columns' colours named, so they're never the only clue. */}
        <ul aria-label="Legend" className="flex gap-4 text-sm text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-xs bg-chart-income" />
            Income
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-xs bg-chart-expense" />
            Expenses
          </li>
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
              style={{ bottom: `${(value / top) * 100}%` }}
            >
              <span className="absolute right-full mr-2 -translate-y-1/2 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
                {label}
              </span>
            </div>
          ))}

          <ol aria-label="Months" className="absolute inset-0 flex">
            {months.map(({ month, income, expense }, index) => {
              const soFar = month === thisMonth
              const name = `${longMonth(month)}${soFar ? ' so far' : ''}: Income ${formatAmount(income, currency)}, Expenses ${formatAmount(expense, currency)}, Net ${formatNet(income - expense, currency)}`
              return (
                <li key={month} className="flex h-full min-w-0 flex-1">
                  <Link
                    to="/"
                    search={{ month }}
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
                      'flex h-full flex-1 items-end justify-center gap-0.5 rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                      active?.index === index && 'bg-muted',
                    )}
                  >
                    <span
                      className={cn('w-2 rounded-t-[4px] bg-chart-income sm:w-3.5', soFar && 'opacity-55')}
                      style={{ height: columnHeight(income, top) }}
                    />
                    <span
                      className={cn('w-2 rounded-t-[4px] bg-chart-expense sm:w-3.5', soFar && 'opacity-55')}
                      style={{ height: columnHeight(expense, top) }}
                    />
                  </Link>
                </li>
              )
            })}
          </ol>

          {shown && active && (
            <MonthFigures
              figures={shown}
              soFar={shown.month === thisMonth}
              currency={currency}
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

// A month's Income, Expenses and Net over the chart, above its columns and
// kept inside the plot at either end. A tap pins it, with a link to open the
// month, as the first tap doesn't. Otherwise it repeats the month's link name,
// so it is hidden from screen readers.
function MonthFigures({
  figures: { month, income, expense },
  soFar,
  currency,
  index,
  monthCount,
  pinned,
}: {
  figures: TrendsMonth
  soFar: boolean
  currency: CurrencyCode
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
        <FigureRow label="Income" swatch="bg-chart-income" value={formatAmount(income, currency)} />
        <FigureRow label="Expenses" swatch="bg-chart-expense" value={formatAmount(expense, currency)} />
        <div className="mt-0.5 border-t pt-1.5">
          <FigureRow label="Net" value={formatNet(income - expense, currency)} />
        </div>
      </div>
      {pinned && (
        <Link
          to="/"
          search={{ month }}
          className="-mx-1 mt-1 flex min-h-11 items-center rounded-md px-1 font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Open {longMonth(month)}
        </Link>
      )}
    </div>
  )
}

function FigureRow({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {swatch && <span aria-hidden="true" className={cn('size-2 rounded-xs', swatch)} />}
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
