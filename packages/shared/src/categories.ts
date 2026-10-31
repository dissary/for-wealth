import { z } from 'zod'

// Every Category is an Income or an Expense Category, fixed when it is
// created. The kind decides whether a Transaction under it is Income or an
// Expense (ADR 0005).
export const CATEGORY_KINDS = ['income', 'expense'] as const

export type CategoryKind = (typeof CATEGORY_KINDS)[number]

// Written for every new user (v1-spec "Categories"), in this order, with
// "Other" last.
export const STARTER_CATEGORIES: Record<CategoryKind, readonly string[]> = {
  income: ['Salary', 'Bonus', 'Side income', 'Other'],
  expense: [
    'Food',
    'Transport',
    'Housing',
    'Utilities',
    'Bills & Subscriptions',
    'Shopping',
    'Health',
    'Entertainment',
    'Family',
    'Other',
  ],
}

export const CATEGORY_NAME_MAX_LENGTH = 40

// At most this many that aren't archived per kind (v1-spec "Settings").
export const CATEGORY_LIMIT = 50

// Trimmed. Unique within the kind ignoring case, archived Categories
// included, which only the API can check.
export const categoryNameSchema = z
  .string({ error: 'Enter a name' })
  .trim()
  .min(1, 'Enter a name')
  .max(CATEGORY_NAME_MAX_LENGTH, `Use ${CATEGORY_NAME_MAX_LENGTH} characters or fewer`)

// What the API takes to add a Category. Its kind can't be changed afterwards.
export const newCategorySchema = z.object({
  name: categoryNameSchema,
  kind: z.enum(CATEGORY_KINDS, { error: 'Choose Income or Expense' }),
})

export type NewCategory = z.output<typeof newCategorySchema>

// What the API takes to rename a Category: the name and nothing else.
export const categoryChangesSchema = z.object({ name: categoryNameSchema })

// Swaps a Category with its neighbour in the same kind.
export const moveCategorySchema = z.object({ direction: z.enum(['up', 'down']) })

export type MoveDirection = z.output<typeof moveCategorySchema>['direction']
