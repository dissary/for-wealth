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
