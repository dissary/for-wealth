import { createFileRoute } from '@tanstack/react-router'
import { currencyLabel } from '@/lib/currency'

export const Route = createFileRoute('/_signed-in/')({
  component: Home,
})

function Home() {
  const { me } = Route.useRouteContext()

  return (
    <main className="flex flex-1 flex-col justify-center gap-6 py-12">
      <h1 className="text-5xl font-semibold tracking-tight">Hello, {me.name}.</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd>{me.email}</dd>
        <dt className="text-muted-foreground">Currency</dt>
        <dd>{currencyLabel(me.currency)}</dd>
        <dt className="text-muted-foreground">Time zone</dt>
        <dd>{me.timeZone}</dd>
      </dl>
    </main>
  )
}
