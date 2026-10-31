import { nameSchema, timeZoneSchema } from '@for-wealth/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { LocateFixedIcon } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { CategorySettings } from '@/components/category-settings'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { type AuthErrorCode, authClient } from '@/lib/auth-client'
import { currencyLabel } from '@/lib/currency'
import type { Me } from '@/lib/me'
import { searchTimeZones, timeZoneChoices, timeZoneLabel } from '@/lib/time-zones'

// The user's own details. Opened from the user menu, not the header's links.
export const Route = createFileRoute('/_signed-in/settings')({
  component: SettingsPage,
})

const CANT_REACH = "Couldn't reach For Wealth. Check your connection and save again."

function SettingsPage() {
  const { me } = Route.useRouteContext()

  return (
    // A reading column, as on the Transactions page.
    <main className="flex max-w-3xl flex-col gap-8 py-8 sm:py-12">
      <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Settings</h1>
      <Section id="profile" title="Profile">
        <ProfileForm me={me} />
      </Section>
      <Section id="password" title="Password">
        <p className="text-sm text-muted-foreground">Changing your password is coming soon.</p>
      </Section>
      <Section id="time-zone" title="Time zone">
        <TimeZoneForm savedZone={me.timeZone} />
      </Section>
      <Section id="currency" title="Currency">
        <p className="font-medium">{currencyLabel(me.currency)}</p>
        <p className="text-sm text-muted-foreground">
          Every amount is in this currency. It was chosen when you signed up and can't be changed.
        </p>
      </Section>
      <Section id="categories" title="Categories">
        <CategorySettings />
      </Section>
    </main>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4 border-t pt-6">
      <h2 id={`${id}-heading`} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

const profileSchema = z.object({ name: nameSchema })

// The name, with the sign-up rules. The email is shown, not changed.
function ProfileForm({ me }: { me: Me }) {
  const router = useRouter()
  const form = useForm<z.input<typeof profileSchema>, unknown, z.output<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: me.name },
  })
  const { errors, isSubmitting, isDirty } = form.formState
  const [saved, setSaved] = useState(false)

  async function onSubmit({ name }: z.output<typeof profileSchema>) {
    setSaved(false)
    let result
    try {
      result = await authClient.updateUser({ name })
    } catch {
      return form.setError('root', { message: CANT_REACH })
    }
    const { error } = result
    // Says what's wrong in words, with the sign-up rules.
    if (error?.code === ('INVALID_NAME' satisfies AuthErrorCode)) {
      return form.setError('name', { message: error.message ?? 'Enter your name' }, { shouldFocus: true })
    }
    if (error) return form.setError('root', { message: "Your name wasn't saved. Try again." })
    // The header shows the name from the signed-in layout.
    await router.invalidate()
    form.reset({ name })
    setSaved(true)
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            autoComplete="name"
            className="sm:max-w-sm"
            aria-invalid={!!errors.name}
            aria-describedby="name-error"
            {...form.register('name')}
          />
          <FieldError id="name-error" errors={[errors.name]} />
        </Field>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Email</p>
          <p className="break-all">{me.email}</p>
        </div>
        <FieldError errors={[errors.root]} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? 'Saving…' : 'Save name'}
          </Button>
          {saved && !isDirty && (
            <p role="status" className="text-sm text-muted-foreground">
              Saved.
            </p>
          )}
        </div>
      </FieldGroup>
    </form>
  )
}

const timeZoneFormSchema = z.object({ timeZone: timeZoneSchema })

// The device's zone, which can differ from the saved one when travelling.
// Nothing prompts about that: today stays where the user put it.
const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone

// A searchable list of zones, and a button for the device's own.
function TimeZoneForm({ savedZone }: { savedZone: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const zones = useMemo(
    () => timeZoneChoices(Intl.supportedValuesOf('timeZone'), [savedZone, deviceZone]),
    [savedZone],
  )
  const [search, setSearch] = useState('')
  const [savedTo, setSavedTo] = useState<string>()
  const form = useForm<z.input<typeof timeZoneFormSchema>, unknown, z.output<typeof timeZoneFormSchema>>({
    resolver: zodResolver(timeZoneFormSchema),
    defaultValues: { timeZone: savedZone },
  })
  const { errors, isSubmitting, isDirty } = form.formState
  const chosen = useWatch({ control: form.control, name: 'timeZone' })
  const matches = searchTimeZones(zones, search)

  async function onSubmit({ timeZone }: z.output<typeof timeZoneFormSchema>) {
    setSavedTo(undefined)
    let result
    try {
      result = await authClient.updateUser({ timeZone })
    } catch {
      return form.setError('root', { message: CANT_REACH })
    }
    const { error } = result
    // An unknown zone or a fixed offset, refused by Better Auth's validator,
    // whose code isn't in the Auth type.
    if (error?.status === 400) return form.setError('timeZone', { message: error.message ?? 'Unknown time zone' })
    if (error) return form.setError('root', { message: "Your time zone wasn't saved. Try again." })

    // Today, Periods, Budgets' per-day figures and catching up on Recurring
    // Transactions all follow the zone, so nothing loaded under the old one
    // is kept. Transactions keep their dates, as they're calendar dates.
    await queryClient.resetQueries()
    await router.invalidate()
    form.reset({ timeZone })
    setSearch('')
    setSavedTo(timeZone)
  }

  function chooseDeviceZone() {
    form.setValue('timeZone', deviceZone, { shouldDirty: true })
    void form.handleSubmit(onSubmit)()
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <p className="text-sm text-muted-foreground">
          Today, this week and this month follow it. Transactions keep their dates.
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-8 w-fit max-w-full py-1.5 text-left whitespace-normal"
          disabled={isSubmitting || deviceZone === savedZone}
          onClick={chooseDeviceZone}
        >
          <LocateFixedIcon aria-hidden="true" />
          Use this device's time zone ({timeZoneLabel(deviceZone)})
        </Button>

        <fieldset
          data-invalid={!!errors.timeZone}
          className="flex flex-col gap-2"
          aria-describedby="timeZone-chosen timeZone-error"
        >
          <legend className="mb-2 text-sm font-medium">Time zone</legend>
          <p id="timeZone-chosen" className="text-sm">
            Chosen: <span className="font-medium">{timeZoneLabel(chosen)}</span>
          </p>
          <Input
            type="search"
            aria-label="Search time zones"
            placeholder="Search, e.g. Kuala Lumpur"
            autoComplete="off"
            spellCheck={false}
            className="sm:max-w-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="max-h-64 overflow-y-auto rounded-lg border">
            {matches.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No time zone matches “{search.trim()}”.</p>
            ) : (
              matches.map((zone) => (
                <label
                  key={zone}
                  className="relative flex cursor-pointer items-center px-3 py-2 text-sm select-none hover:bg-muted has-checked:bg-accent has-checked:font-medium has-checked:text-accent-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-focus-visible:ring-inset"
                >
                  <input type="radio" value={zone} className="sr-only" {...form.register('timeZone')} />
                  {timeZoneLabel(zone)}
                </label>
              ))
            )}
          </div>
          <FieldError id="timeZone-error" errors={[errors.timeZone]} />
        </fieldset>

        <FieldError errors={[errors.root]} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? 'Saving…' : 'Save time zone'}
          </Button>
          {savedTo && !isDirty && (
            <p role="status" className="text-sm text-muted-foreground">
              Saved. Every page now uses {timeZoneLabel(savedTo)}.
            </p>
          )}
        </div>
      </FieldGroup>
    </form>
  )
}
