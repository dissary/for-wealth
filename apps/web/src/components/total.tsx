// A Period's or month's Income or Expense total, in a <dl>. The label says
// which is which, so the amount carries no sign.
export function Total({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-medium tabular-nums">{amount}</dd>
    </div>
  )
}
