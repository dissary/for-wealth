import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { api } from '@/lib/api'

const healthQuery = queryOptions({
  queryKey: ['health'],
  queryFn: async () => {
    const res = await api.health.$get()
    if (!res.ok) throw new Error(`Health check failed with ${res.status}`)
    return res.json()
  },
  // Show a down API straight away instead of after several retries.
  retry: false,
})

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const health = useQuery(healthQuery)

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>For Wealth</CardTitle>
          <CardDescription>
            Track, plan and understand your spending.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p role="status">
            {health.isPending
              ? 'Checking API…'
              : health.isSuccess
                ? 'API connected'
                : 'API not connected'}
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
