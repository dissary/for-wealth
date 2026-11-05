import { PlusIcon } from 'lucide-react'

// A phone's Add Transaction button, floating above the tab bar at the
// thumb's corner. It opens the page's own Add dialog, so it starts on the
// date the page's own button would. From sm up the page's button is enough.
// It sits 1rem above the tab bar (h-16), and the signed-in layout pads the
// foot of each page so the last row can scroll clear of it.
export function FloatingAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Add Transaction"
      aria-haspopup="dialog"
      onClick={onClick}
      className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-colors outline-none hover:bg-primary-hover focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px sm:hidden"
    >
      <PlusIcon aria-hidden="true" className="size-6" />
    </button>
  )
}
