import { createFileRoute, redirect } from '@tanstack/react-router'

// Until the dashboard arrives in slice 3, the Transactions page is home.
// The layout's beforeLoad runs first, so only signed-in users get here.
export const Route = createFileRoute('/_signed-in/')({
  beforeLoad: () => {
    throw redirect({ to: '/transactions', replace: true })
  },
})
