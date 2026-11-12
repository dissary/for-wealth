import { Link, linkOptions } from '@tanstack/react-router'
import { ChartColumnIcon, ReceiptTextIcon, RepeatIcon, WalletIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// The four pages every signed-in user moves between: in the header from sm
// up, and in a tab bar at the foot of a phone's screen (v1-spec "The phone
// layout").
const PAGES = [
  {
    label: 'Dashboard',
    icon: WalletIcon,
    // Active on any month of the Dashboard, but not on the pages under it.
    link: linkOptions({ to: '/', activeOptions: { exact: true, includeSearch: false } }),
  },
  {
    label: 'Transactions',
    icon: ReceiptTextIcon,
    // Active on any Period or filter of the page, not only the bare path.
    link: linkOptions({ to: '/transactions', activeOptions: { includeSearch: false } }),
  },
  { label: 'Trends', icon: ChartColumnIcon, link: linkOptions({ to: '/trends' }) },
  // The mark a Transaction from a Recurring Transaction carries.
  { label: 'Recurring', icon: RepeatIcon, link: linkOptions({ to: '/recurring' }) },
]

// The router marks the current page's link aria-current, and it becomes a
// raised pill, like the chosen side of a switch.
const HEADER_LINK =
  'flex h-9 items-center rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-panel'

export function HeaderNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Main" className={cn('items-center gap-1', className)}>
      {PAGES.map(({ label, link }) => (
        <Link key={label} {...link} className={HEADER_LINK}>
          {label}
        </Link>
      ))}
    </nav>
  )
}

// The current tab's icon sits on a tinted pill. Each tab is the bar's full
// height and a quarter of its width, over 44 px each way even at 360 px, and
// the bar clears the home indicator.
const TAB =
  'group flex h-16 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground transition-colors outline-none aria-[current=page]:font-semibold aria-[current=page]:text-foreground'
const TAB_ICON =
  'flex h-7 w-14 items-center justify-center rounded-full transition-colors group-focus-visible:ring-3 group-focus-visible:ring-ring/50 group-aria-[current=page]:bg-accent group-aria-[current=page]:text-primary [&_svg]:size-5'

export function TabBar({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t bg-card pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
        className,
      )}
    >
      <div className="grid grid-cols-4">
        {PAGES.map(({ label, icon: Icon, link }) => (
          <Link key={label} {...link} className={TAB}>
            <span className={TAB_ICON}>
              <Icon aria-hidden="true" />
            </span>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
