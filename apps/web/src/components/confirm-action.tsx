import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { TRANSACTIONS_KEY } from '@/lib/transactions'
import { isTooManyWrites, TOO_MANY_WRITES } from '@/lib/write-limit'

// An action that can't be undone, under a dialog's form, which asks first.
// The warning is in the words, not in red: `destructive` is ink, as red is
// kept for Budgets (v1-spec "Design"). Done, or already done elsewhere (404),
// it refreshes everything shown from the Transactions.
export function ConfirmAction({
  action,
  question,
  confirm,
  working,
  failed,
  run,
  onDone,
}: {
  // "Delete": the button that asks.
  action: string
  question: string
  // "Delete Transaction" and "Deleting…".
  confirm: string
  working: string
  // "The Transaction wasn't deleted."
  failed: string
  run: () => Promise<Response>
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function onConfirm() {
    setBusy(true)
    setError(undefined)
    let res
    try {
      res = await run()
    } catch {
      setBusy(false)
      return setError(`Couldn't reach For Wealth. Check your connection and try again.`)
    }
    setBusy(false)

    if (res.ok || res.status === 404) {
      void queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
      return onDone()
    }
    setError(isTooManyWrites(res) ? TOO_MANY_WRITES : `${failed} Try again.`)
  }

  if (!confirming) {
    return (
      <div className="border-t pt-4">
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          {action}
        </Button>
      </div>
    )
  }

  return (
    <div role="group" aria-label={question} className="flex flex-col gap-3 border-t pt-4">
      <p className="text-sm">{question}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" disabled={busy} onClick={onConfirm} autoFocus>
          {busy ? working : confirm}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
          Keep it
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  )
}
