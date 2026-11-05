import { Link, linkOptions } from '@tanstack/react-router'
import { ReceiptTextIcon, RepeatIcon, WalletIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// The three pages every signed-in user moves between: along the header's
// bottom edge from sm up, and in a tab bar at the foot of a phone's screen
// (v1-spec "The phone layout").
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
  // The mark a Transaction from a Recurring Transaction carries.
  { label: 'Recurring', icon: RepeatIcon, link: linkOptions({ to: '/recurring' }) },
]

// The router marks the current page's link aria-current, and it is
// underlined in the accent on the header's rule.
const HEADER_LINK =
  'relative flex h-14 items-center rounded-md px-1 text-sm text-muted-foreground transition-colors outline-none after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:after:bg-primary'

export function HeaderNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Main" className={cn('items-center gap-5', className)}>
      {PAGES.map(({ label, link }) => (
        <Link key={label} {...link} className={HEADER_LINK}>
          {label}
        </Link>
      ))}
    </nav>
  )
}

// The same marker as the header's, on the tab bar's own rule: the current
// tab is barred in the accent along its top edge. Each tab is the bar's full
// height, well over 44 px, and the bar clears the home indicator.
const TAB =
  'relative flex h-16 flex-col items-center justify-center gap-1 rounded-md text-xs text-muted-foreground transition-colors outline-none before:absolute before:inset-x-5 before:-top-px before:h-0.5 before:rounded-full focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:before:bg-primary [&_svg]:size-5 aria-[current=page]:[&_svg]:text-primary'

export function TabBar({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t bg-card pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
        className,
      )}
    >
      <div className="grid grid-cols-3">
        {PAGES.map(({ label, icon: Icon, link }) => (
          <Link key={label} {...link} className={TAB}>
            <Icon aria-hidden="true" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
