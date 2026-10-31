import { type CategoryKind, categoryNameSchema, type MoveDirection } from '@for-wealth/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { type Category, categoriesQuery, KIND_LABELS, refreshAfterCategoryChange } from '@/lib/categories'
import { isTooManyWrites, TOO_MANY_WRITES } from '@/lib/write-limit'

// Income first, as the spec lists them.
const LIST_ORDER: readonly CategoryKind[] = ['income', 'expense']

const CANT_REACH = "Couldn't reach For Wealth. Check your connection and try again."

// Settings' Categories: an Income and an Expense list, each in the order
// every picker uses, with Rename, up and down on each row and an Add button
// per kind. Kind is chosen when adding and fixed afterwards (ADR 0005).
export function CategorySettings() {
  const categories = useQuery(categoriesQuery)
  // Closing keeps what it was opened for, so the title doesn't change while
  // it fades out.
  const [dialog, setDialog] = useState<{ open: boolean; kind: CategoryKind; category?: Category }>({
    open: false,
    kind: 'expense',
  })

  if (categories.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (categories.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
        <p>Your Categories couldn't be loaded.</p>
        <Button variant="outline" size="sm" onClick={() => categories.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        This order is used in every Category list, in Edit Budgets and on the Dashboard.
      </p>
      {LIST_ORDER.map((kind) => (
        <CategoryList
          key={kind}
          kind={kind}
          list={categories.data[kind]}
          onAdd={() => setDialog({ open: true, kind })}
          onRename={(category) => setDialog({ open: true, kind, category })}
        />
      ))}
      <CategoryNameDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        kind={dialog.kind}
        category={dialog.category}
      />
    </>
  )
}

function CategoryList({
  kind,
  list,
  onAdd,
  onRename,
}: {
  kind: CategoryKind
  list: Category[]
  onAdd: () => void
  onRename: (category: Category) => void
}) {
  const queryClient = useQueryClient()
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string>()
  // Read out once a move shows, as the row moves under the button pressed.
  const [moved, setMoved] = useState('')
  const headingId = `categories-${kind}-heading`

  async function move(category: Category, direction: MoveDirection) {
    setMoving(true)
    setError(undefined)
    setMoved('')
    let res
    try {
      res = await api.categories[':id'].move.$post({ param: { id: category.id }, json: { direction } })
    } catch {
      setMoving(false)
      return setError(CANT_REACH)
    }
    // Saved, or the Category went elsewhere: the list shows what's there
    // before another press.
    if (res.ok || res.status === 404) await refreshAfterCategoryChange(queryClient)
    setMoving(false)

    if (res.ok) return setMoved(`Moved ${category.name} ${direction}.`)
    if (res.status === 404) return setError(`${category.name} is no longer available, so it wasn't moved.`)
    setError(isTooManyWrites(res) ? TOO_MANY_WRITES : `${category.name} wasn't moved. Try again.`)
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 id={headingId} className="font-medium">
        {KIND_LABELS[kind]}
      </h3>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {KIND_LABELS[kind]} Categories. Add one to record {KIND_LABELS[kind]} under it.
        </p>
      ) : (
        <ul aria-labelledby={headingId} className="divide-y border-y">
          {list.map((category, i) => (
            <li key={category.id} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 break-words">{category.name}</span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-haspopup="dialog"
                  aria-label={`Rename ${category.name}`}
                  onClick={() => onRename(category)}
                >
                  Rename
                </Button>
                <MoveButton
                  label={`Move ${category.name} up`}
                  unavailable={moving || i === 0}
                  onMove={() => move(category, 'up')}
                >
                  <ArrowUpIcon aria-hidden="true" />
                </MoveButton>
                <MoveButton
                  label={`Move ${category.name} down`}
                  unavailable={moving || i === list.length - 1}
                  onMove={() => move(category, 'down')}
                >
                  <ArrowDownIcon aria-hidden="true" />
                </MoveButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="sr-only">
        {moved}
      </p>
      <FieldError>{error}</FieldError>
      <Button variant="outline" className="w-fit" aria-haspopup="dialog" onClick={onAdd}>
        <PlusIcon aria-hidden="true" />
        Add {KIND_LABELS[kind]} Category
      </Button>
    </div>
  )
}

// Marked unavailable rather than disabled, so a button that reaches the top
// or bottom, or waits on a move, keeps the keyboard focus.
function MoveButton({
  label,
  unavailable,
  onMove,
  children,
}: {
  label: string
  unavailable: boolean
  onMove: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-disabled={unavailable}
      className="aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
      onClick={() => {
        if (!unavailable) onMove()
      }}
    >
      {children}
    </Button>
  )
}

const nameFormSchema = z.object({ name: categoryNameSchema })

type NameFormValues = z.output<typeof nameFormSchema>

// Adds a Category of one kind, or renames one: a dialog over the page, a
// sheet on a phone.
function CategoryNameDialog({
  open,
  onOpenChange,
  kind,
  category,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: CategoryKind
  category: Category | undefined
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="break-words">
            {category ? `Rename ${category.name}` : `Add ${KIND_LABELS[kind]} Category`}
          </DialogTitle>
          <DialogDescription>
            {category
              ? 'Its Transactions show the new name, past ones included.'
              : `It goes last in the list. It stays an ${KIND_LABELS[kind]} Category.`}
          </DialogDescription>
        </DialogHeader>
        {/* Inside the content, so each opening starts with a fresh form. */}
        <NameForm kind={kind} category={category} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function NameForm({
  kind,
  category,
  onDone,
}: {
  kind: CategoryKind
  category: Category | undefined
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const form = useForm<z.input<typeof nameFormSchema>, unknown, NameFormValues>({
    resolver: zodResolver(nameFormSchema),
    defaultValues: { name: category?.name ?? '' },
  })
  const { errors, isSubmitting } = form.formState

  async function onSubmit({ name }: NameFormValues) {
    // Nothing to save, so no request spends a write from the limit.
    if (category && name === category.name) return onDone()
    let res
    try {
      res = category
        ? await api.categories[':id'].$patch({ param: { id: category.id }, json: { name } })
        : await api.categories.$post({ json: { name, kind } })
    } catch {
      return form.setError('root', { message: CANT_REACH })
    }

    if (res.ok) {
      void refreshAfterCategoryChange(queryClient)
      return onDone()
    }
    if (res.status === 409) {
      const { code, message } = await res.json()
      // The message names the Category that has the name, and says to
      // restore it when it's archived.
      if (code === 'CATEGORY_NAME_TAKEN') return form.setError('name', { message }, { shouldFocus: true })
      return form.setError('root', { message })
    }
    if (res.status === 404) {
      void refreshAfterCategoryChange(queryClient)
      return form.setError('root', {
        message: 'This Category is no longer available. Close this to see your Categories.',
      })
    }
    if (res.status === 400) {
      const { fields } = await res.json()
      const wrong = fields.name?.[0]
      if (wrong) return form.setError('name', { message: wrong }, { shouldFocus: true })
    }
    if (isTooManyWrites(res)) {
      return form.setError('root', { message: TOO_MANY_WRITES })
    }
    form.setError('root', { message: "The Category wasn't saved. Try again." })
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="category-name">Name</FieldLabel>
          <Input
            id="category-name"
            autoComplete="off"
            aria-invalid={!!errors.name}
            aria-describedby="category-name-error"
            {...form.register('name')}
          />
          <FieldError id="category-name-error" errors={[errors.name]} />
        </Field>
        <FieldError errors={[errors.root]} />
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : category ? 'Save name' : 'Add Category'}
        </Button>
      </FieldGroup>
    </form>
  )
}
